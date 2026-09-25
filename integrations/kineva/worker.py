#!/usr/bin/env python3
"""Local Insomnia -> Kineva worker. Run only on the ComfyUI machine."""
import argparse
import copy
import json
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
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

def normalized_words(value):
    return " ".join(str(value or "").split())


def verify_locked_dialogue(report, spoken_script):
    shots = (report.get("locked_plan") or {}).get("shots") or []
    lines = [str(item.get("line") or "") for shot in shots
             for item in (shot.get("dialogue") or [])]
    if len(shots) != 1 or normalized_words(" ".join(lines)) != normalized_words(spoken_script):
        raise RuntimeError("Locked plan altered the exact spoken segment")


def make_prompt(template, job, image_name, manifest_path):
    graph = copy.deepcopy(template)
    if not all(isinstance(node.get("inputs"), dict) for node in graph.values()):
        raise ValueError("Expected ComfyUI API workflow JSON, not UI workflow JSON")
    one(graph, "MinimaxStoryPlanner")[1]["inputs"]["story"] = job["prompt"]
    one(graph, "LoadImage")[1]["inputs"]["image"] = image_name
    one(graph, "KinevaStoryCastFromManifest")[1]["inputs"]["manifest_path"] = str(manifest_path)
    spoken_script = str(job.get("spoken_script") or "").strip()
    if not spoken_script:
        raise ValueError("Missing exact spoken script for Kineva shot")
    presenter = job["profile"] == "TALKING_PRESENTER"
    one(graph, "KinevaPlanLock")[1]["inputs"].update({
        "profile": job["profile"], "preserve_dialogue": True,
        "exact_dialogue": spoken_script,
        "dialogue_language": str((job.get("bible") or {}).get("language") or "Spanish"),
        "project_id": job["project_name"],
        "force_single_take": presenter, "presenter_visible": presenter,
        "lock_camera": presenter,
    })
    background_lock = one(graph, "KinevaStaticBackgroundLock")[1]["inputs"]
    background_lock["enabled"] = presenter
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

def wait_for_render(comfy, prompt_id, export_node, heartbeat=None,
                    interval=10, timeout=28800):
    deadline = time.monotonic() + timeout
    if heartbeat:
        heartbeat()
    next_heartbeat = time.monotonic() + 300
    while time.monotonic() < deadline:
        if heartbeat and time.monotonic() >= next_heartbeat:
            heartbeat()
            next_heartbeat = time.monotonic() + 300
        history = comfy.call("GET", "/history/" + quote(prompt_id)).get(prompt_id)
        if history:
            status = history.get("status", {})
            if status.get("status_str") != "success":
                raise RuntimeError("ComfyUI failed: " + str(status.get("messages", []))[-1500:])
            output = history.get("outputs", {}).get(export_node, {})
            videos = output.get("images", [])
            if not videos:
                raise RuntimeError("Master Export did not return a video")
            if heartbeat:
                heartbeat()
            return videos[0]
        time.sleep(interval)
    raise TimeoutError("ComfyUI render exceeded the eight-hour limit")

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

def render(job, cloud, comfy, template, input_dir, output_dir, heartbeat=None):
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
    video = wait_for_render(comfy, created["prompt_id"], export_node, heartbeat=heartbeat)
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
    verify_locked_dialogue(report, job["spoken_script"])
    if heartbeat:
        heartbeat()
    storage_path = f"episodes/{job['episode_id']}/kineva/{job['id']}.mp4"
    if output.stat().st_size > 50_000_000:
        raise RuntimeError("Video exceeds 50 MB; configure resumable upload")
    cloud.call("POST", "/storage/v1/object/shorts-media/" + quote(storage_path, safe="/"),
               payload=output.read_bytes(), raw=True,
               headers={"Content-Type": "video/mp4", "x-upsert": "true"})
    return storage_path, report


def probe_video(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format",
         "-of", "json", str(path)],
        capture_output=True, text=True, timeout=30, check=True)
    info = json.loads(result.stdout)
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    duration = float(info["format"].get("duration", 0))
    if not video or not audio or duration <= 0:
        raise RuntimeError("Video or audio missing from " + path.name)
    return video["width"], video["height"], video.get("avg_frame_rate"), duration

def assemble(assembly, cloud, output_dir):
    episode_id = assembly["episode_id"]
    version = int(assembly["version"])
    paths = assembly["paths"]
    if not isinstance(paths, list) or not 1 <= len(paths) <= 12:
        raise RuntimeError("Invalid shot list")
    with tempfile.TemporaryDirectory(prefix="kineva_assemble_") as temporary:
        directory = Path(temporary)
        clips = []
        for index, path in enumerate(paths):
            if not isinstance(path, str) or not path.startswith(
                    "episodes/" + episode_id + "/kineva/") or not path.endswith(".mp4"):
                raise RuntimeError("Invalid shot storage path")
            data = cloud.call("GET", "/storage/v1/object/authenticated/shorts-media/" +
                              quote(path, safe="/"), raw=True)
            clip = directory / ("shot_%02d.mp4" % (index + 1))
            clip.write_bytes(data)
            clips.append(clip)
        media = [probe_video(clip) for clip in clips]
        if len({(width, height, fps) for width, height, fps, _ in media}) != 1:
            raise RuntimeError("Shot dimensions or frame rates do not match")
        if any("'" in str(clip) for clip in clips):
            raise RuntimeError("Unsupported quote in temporary path")
        concat = directory / "concat.txt"
        concat.write_text("".join("file '%s'\n" % clip.as_posix() for clip in clips),
                          encoding="utf-8")
        final = directory / "episode.mp4"
        def encode(options):
            command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                       "-f", "concat", "-safe", "0", "-i", str(concat),
                       "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264",
                       "-preset", "medium", "-pix_fmt", "yuv420p", *options,
                       "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                       str(final)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=1800)
            if result.returncode:
                raise RuntimeError("FFmpeg assembly: " + result.stderr[-800:])
        encode(["-crf", "20"])
        if final.stat().st_size > 48_000_000:
            duration = sum(item[3] for item in media)
            bitrate = max(650_000, min(2_000_000, int(44_000_000 * 8 / duration) - 128_000))
            encode(["-b:v", str(bitrate), "-maxrate", str(bitrate),
                    "-bufsize", str(bitrate * 2)])
        if final.stat().st_size > 50_000_000:
            raise RuntimeError("Episode exceeds 50 MB Storage limit; split the scene")
        final_meta = probe_video(final)
        expected = sum(item[3] for item in media)
        if abs(final_meta[3] - expected) > max(1.5, 0.12 * len(clips)):
            raise RuntimeError("Assembled duration differs from the shot total")
        destination = ("episodes/" + episode_id + "/kineva/assembly_v" +
                       str(version) + ".mp4")
        cloud.call("POST", "/storage/v1/object/shorts-media/" +
                   quote(destination, safe="/"), payload=final.read_bytes(), raw=True,
                   headers={"Content-Type": "video/mp4", "x-upsert": "true"})
        report = {"version": 1, "episode_id": episode_id, "assembly_version": version,
                  "shot_paths": paths, "duration_seconds": final_meta[3],
                  "width": final_meta[0], "height": final_meta[1],
                  "audio_present": True, "size_bytes": final.stat().st_size}
        folder = output_dir / "kineva_manifests"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / ("assembly_" + episode_id + "_v" + str(version) + ".json")).write_text(
            json.dumps(report, indent=2), encoding="utf-8")
        return destination

def process_assembly(cloud, output_dir, episode_id):
    assembly = cloud.call("POST", "/rest/v1/rpc/claim_kineva_assembly",
                          {"p_episode_id": episode_id})
    if not assembly:
        return False
    try:
        path = assemble(assembly, cloud, output_dir)
        payload = {"p_episode_id": episode_id, "p_version": assembly["version"],
                   "p_success": True, "p_output_path": path}
    except Exception as error:
        print("Assembly failed", episode_id, repr(error), file=sys.stderr, flush=True)
        payload = {"p_episode_id": episode_id, "p_version": assembly["version"],
                   "p_success": False, "p_error": str(error)[:500]}
    if cloud.call("POST", "/rest/v1/rpc/finish_kineva_assembly", payload) is not True:
        raise RuntimeError("Assembly was superseded")
    return True

def pending_assembly(cloud, output_dir):
    episodes = cloud.call(
        "GET", "/rest/v1/shorts_episodes?select=id&status=in.(generating,assembling)"
               "&kineva_shot_count=not.is.null&limit=20")
    for episode in episodes:
        if process_assembly(cloud, output_dir, episode["id"]):
            return True
    return False

def run_once(cloud, comfy, template, input_dir, output_dir):
    jobs = cloud.call("POST", "/rest/v1/rpc/claim_kineva_job", {})
    if not jobs:
        return pending_assembly(cloud, output_dir)
    job = jobs[0]
    print("Claimed", job["id"], flush=True)
    def renew():
        valid = cloud.call("POST", "/rest/v1/rpc/renew_kineva_job",
                           {"p_job_id": job["id"], "p_lease_token": job["lease_token"]})
        if valid is not True:
            raise RuntimeError("Job lease was reclaimed by another worker")
    try:
        # Episode number is server-owned. The worker reads it before building the graph.
        episode = cloud.call("GET", "/rest/v1/shorts_episodes?id=eq." +
                             quote(job["episode_id"]) + "&select=episode_number")
        job["episode_number"] = episode[0]["episode_number"]
        path, report = render(job, cloud, comfy, template, input_dir, output_dir,
                              heartbeat=renew)
        renew()
        payload = {"p_job_id": job["id"], "p_lease_token": job["lease_token"],
                   "p_success": True, "p_output_path": path, "p_manifest": report}
    except Exception as error:
        print("Failed", job["id"], repr(error), file=sys.stderr, flush=True)
        payload = {"p_job_id": job["id"], "p_lease_token": job["lease_token"],
                   "p_success": False, "p_error": str(error)[:500]}
    done = cloud.call("POST", "/rest/v1/rpc/finish_kineva_job", payload)
    if done is not True:
        raise RuntimeError("Job lease expired; result was not published")
    if payload["p_success"]:
        process_assembly(cloud, output_dir, job["episode_id"])
    return True

def validate_runtime(comfy, template, input_dir, output_dir):
    for directory in (input_dir, output_dir):
        if not directory.is_dir():
            raise RuntimeError("ComfyUI directory missing: " + str(directory))
    for executable in ("ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            raise RuntimeError("Required executable missing from PATH: " + executable)
    available = comfy.call("GET", "/object_info")
    required_nodes = {node["class_type"] for node in template.values()}
    missing = required_nodes.difference(available)
    if missing:
        raise RuntimeError("ComfyUI nodes missing: " + ", ".join(sorted(missing)))
    plan_inputs = available["KinevaPlanLock"]["input"]["required"]
    fields = {"exact_dialogue", "dialogue_language", "project_id"}
    if not fields.issubset(plan_inputs):
        raise RuntimeError("Restart ComfyUI to load the current KinevaPlanLock node")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow-api", type=Path, required=True)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    comfy = Api(os.environ.get("KINEVA_COMFY_URL", "http://127.0.0.1:8188"))
    template = json.loads(args.workflow_api.read_text(encoding="utf-8"))
    one(template, "MinimaxStoryPlanner")
    one(template, "KinevaMasterExport")
    validate_runtime(comfy, template, args.input_dir, args.output_dir)
    if args.preflight:
        print("Kineva local preflight OK", flush=True)
        return
    url, key = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    cloud = Api(url, key)
    while True:
        worked = run_once(cloud, comfy, template, args.input_dir, args.output_dir)
        if args.once:
            break
        if not worked:
            time.sleep(10)

if __name__ == "__main__":
    main()
