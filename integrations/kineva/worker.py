#!/usr/bin/env python3
"""Local Insomnia -> Kineva worker. Run only on the ComfyUI machine."""
import argparse
import copy
import json
import mimetypes
import os
import re
from pathlib import Path
import sys
import time
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

class Api:
    def __init__(self, base, key=None):
        self.base = base.rstrip("/")
        self.key = key
    def call(self, method, path, payload=None, raw=False, headers=None):
        data = payload if isinstance(payload, bytes) else (
            json.dumps(payload).encode("utf-8") if payload is not None else None)
        h = {"Accept": "application/json", **(headers or {})}
        if self.key:
            h.update({"apikey": self.key, "Authorization": "Bearer " + self.key})
        if data is not None and not isinstance(payload, bytes):
            h["Content-Type"] = "application/json"
        request = Request(self.base + path, data=data, headers=h, method=method)
        try:
            with urlopen(request, timeout=120) as response:
                body = response.read()
                return body if raw else json.loads(body or b"null")
        except HTTPError as error:
            raise RuntimeError(f"{method} {path}: HTTP {error.code}: "
                               f"{error.read()[:500]!r}") from error

def one(graph, kind):
    found = [(key, node) for key, node in graph.items()
             if node["class_type"] == kind]
    if len(found) != 1:
        raise ValueError(f"Expected one {kind}, found {len(found)}")
    return found[0]

def make_prompt(template, job, image_name, manifest_path):
    graph = copy.deepcopy(template)
    if not all(isinstance(node.get("inputs"), dict) for node in graph.values()):
        raise ValueError("Expected ComfyUI API workflow JSON, not UI workflow JSON")
    one(graph, "MinimaxStoryPlanner")[1]["inputs"]["story"] = job["prompt"]
    one(graph, "LoadImage")[1]["inputs"]["image"] = image_name
    one(graph, "KinevaStoryCastFromManifest")[1]["inputs"]["manifest_path"] = str(manifest_path)
    one(graph, "KinevaPlanLock")[1]["inputs"].update({
        "profile": job["profile"], "preserve_dialogue": True,
        "force_single_take": False, "presenter_visible": False, "lock_camera": False,
    })
    background_lock = one(graph, "KinevaStaticBackgroundLock")[1]["inputs"]
    background_lock["enabled"] = job["profile"] == "TALKING_PRESENTER"
    if not background_lock["enabled"]:
        background_lock.pop("foreground_mask", None)
        graph = {key: node for key, node in graph.items()
                 if node["class_type"] not in ("RemoveBackground", "LoadBackgroundRemovalModel")}
    one(graph, "KinevaVoiceRouter")[1]["inputs"]["mode"] = "H3_DESIGNED"
    one(graph, "KinevaPromptTrace")[1]["inputs"]["original_prompt"] = job["prompt"]
    name = "insomnia_" + job["id"].replace("-", "")
    one(graph, "KinevaProjectContext")[1]["inputs"].update({
        "project_name": name, "episode": int(job["episode_number"]),
        "scene": 1, "shot": int(job["shot"]), "take": int(job["take"]),
    })
    one(graph, "KinevaRunManifest")[1]["inputs"]["project_name"] = name
    return graph, name

def wait_for_render(comfy, prompt_id, export_node, interval=10, timeout=6900):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        history = comfy.call("GET", "/history/" + quote(prompt_id)).get(prompt_id)
        if history:
            status = history.get("status", {})
            if status.get("status_str") != "success":
                raise RuntimeError("ComfyUI failed: " + str(status.get("messages", []))[-1500:])
            output = history.get("outputs", {}).get(export_node, {})
            videos = output.get("images", [])
            if not videos:
                raise RuntimeError("Master Export did not return a video")
            return videos[0]
        time.sleep(interval)
    raise TimeoutError("ComfyUI render exceeded the worker lease")

def find_manifest(output_dir, project_name, saved_name):
    folder = output_dir / "kineva_manifests"
    for candidate in sorted(folder.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        report = json.loads(candidate.read_text(encoding="utf-8"))
        if report.get("project_name") != project_name:
            continue
        if saved_name not in str(report.get("saved_path", "")):
            continue
        qc = report.get("qc", {})
        if qc.get("issues") != [] or not qc.get("audio_present") or qc.get("frames", 0) < 2:
            raise RuntimeError("Kineva QC failed: " + json.dumps(qc.get("issues")))
        return report
    raise RuntimeError("Missing Kineva Run Manifest for this render")

def render(job, cloud, comfy, template, input_dir, output_dir):
    ref = job["reference_image_path"]
    if not ref or not re.fullmatch(re.escape(job["owner_id"]) + r"/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)", ref, flags=re.I):
        raise ValueError("Missing owned reference image")
    extension = Path(ref).suffix.lower()
    if extension not in (".png", ".jpg", ".jpeg", ".webp"):
        raise ValueError("Unsupported reference image type")
    data = cloud.call("GET", "/storage/v1/object/authenticated/kineva-references/" +
                      quote(ref, safe="/"), raw=True)
    image_name = "kineva_jobs/" + job["id"] + extension
    image_path = input_dir / image_name
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image_path.write_bytes(data)
    cast_manifest = input_dir / "kineva_jobs" / (job["id"] + "_cast.json")
    cast_manifest.write_text('{"version":1,"characters":{},"locations":{}}', encoding="utf-8")
    graph, project_name = make_prompt(template, job, image_name, cast_manifest)
    export_node = one(graph, "KinevaMasterExport")[0]
    created = comfy.call("POST", "/prompt", {"prompt": graph, "client_id": "insomnia-kineva"})
    if "error" in created:
        raise RuntimeError("ComfyUI rejected prompt: " + str(created))
    video = wait_for_render(comfy, created["prompt_id"], export_node)
    if video.get("type") != "output":
        raise RuntimeError("Unexpected ComfyUI output type")
    name = Path(video["filename"]).name
    subfolder = Path(video.get("subfolder") or "")
    if name != video["filename"] or ".." in subfolder.parts or subfolder.is_absolute():
        raise RuntimeError("Unsafe output path")
    output = output_dir / subfolder / name
    if not output.is_file():
        raise RuntimeError("Master Export video is missing")
    report = find_manifest(output_dir, project_name, name)
    storage_path = f"episodes/{job['episode_id']}/kineva/{job['id']}.mp4"
    if output.stat().st_size > 50_000_000:
        raise RuntimeError("Video exceeds 50 MB; configure resumable upload")
    cloud.call("POST", "/storage/v1/object/shorts-media/" + quote(storage_path, safe="/"),
               payload=output.read_bytes(), raw=True,
               headers={"Content-Type": "video/mp4", "x-upsert": "true"})
    return storage_path, report

def run_once(cloud, comfy, template, input_dir, output_dir):
    jobs = cloud.call("POST", "/rest/v1/rpc/claim_kineva_job", {})
    if not jobs:
        return False
    job = jobs[0]
    print("Claimed", job["id"], flush=True)
    try:
        # Episode number is server-owned. The worker reads it before building the graph.
        episode = cloud.call("GET", "/rest/v1/shorts_episodes?id=eq." +
                             quote(job["episode_id"]) + "&select=episode_number")
        job["episode_number"] = episode[0]["episode_number"]
        path, report = render(job, cloud, comfy, template, input_dir, output_dir)
        payload = {"p_job_id": job["id"], "p_lease_token": job["lease_token"],
                   "p_success": True, "p_output_path": path, "p_manifest": report}
    except Exception as error:
        print("Failed", job["id"], repr(error), file=sys.stderr, flush=True)
        payload = {"p_job_id": job["id"], "p_lease_token": job["lease_token"],
                   "p_success": False, "p_error": str(error)[:500]}
    done = cloud.call("POST", "/rest/v1/rpc/finish_kineva_job", payload)
    if done is not True:
        raise RuntimeError("Job lease expired; result was not published")
    return True

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow-api", type=Path, required=True)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    url, key = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    cloud = Api(url, key)
    comfy = Api(os.environ.get("KINEVA_COMFY_URL", "http://127.0.0.1:8188"))
    template = json.loads(args.workflow_api.read_text(encoding="utf-8"))
    one(template, "MinimaxStoryPlanner")
    one(template, "KinevaMasterExport")
    while True:
        worked = run_once(cloud, comfy, template, args.input_dir, args.output_dir)
        if args.once:
            break
        if not worked:
            time.sleep(10)

if __name__ == "__main__":
    main()
