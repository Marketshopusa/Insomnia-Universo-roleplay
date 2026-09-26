"""Local creator endpoint for Insomnia Studio. Run on the ComfyUI workstation."""
import base64
import binascii
import copy
import json
import os
import re
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from worker import Api, find_manifest, one, wait_for_render

HOST = "127.0.0.1"
PORT = int(os.environ.get("KINEVA_LOCAL_PORT", "8787"))
HOME = Path.home()
SHARED = HOME / "AppData/Local/Comfy-Desktop/ComfyUI-Shared"
INPUT = Path(os.environ.get("KINEVA_COMFY_INPUT", str(SHARED / "input")))
OUTPUT = Path(os.environ.get("KINEVA_COMFY_OUTPUT", str(SHARED / "output")))
TEMPLATE_PATH = Path(os.environ.get(
    "KINEVA_API_TEMPLATE",
    str(HOME / "Documents/Kineva-Workflows/ACTIVE/KINEVA_MINISERIES_API_TEMPLATE.json"),
))
COMFY = Api(os.environ.get("KINEVA_COMFY_URL", "http://127.0.0.1:8188"))
JOBS = {}
JOBS_LOCK = threading.Lock()
GPU_LOCK = threading.Lock()
ALLOWED_ORIGINS = re.compile(r"^http://(localhost|127\.0\.0\.1):(?:8080|5173|5174)$")
MAX_IMAGE = 10_000_000

def image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    raise ValueError("La foto debe ser PNG, JPEG o WebP.")

def update(job_id, **fields):
    with JOBS_LOCK:
        JOBS[job_id].update(fields)

def public_job(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            return None
        return {k: v for k, v in job.items() if k not in ("image", "idea")}

def build_graph(template, image_name, manifest_path, idea, job_id, episode, total, previous):
    graph = copy.deepcopy(template)
    story = (
        "Produce one continuous cinematic video shot from the uploaded photo. "
        "The first frame must preserve the people, faces, clothes, pose, composition, "
        "objects, colors and background in the reference photo. Animate the same "
        "people naturally from that first frame; do not invent replacements or "
        "change their identity. Interpret this simple user idea as the action: "
        + idea
        + ". Keep actions temporally continuous. Do not invent spoken dialogue "
        "unless the idea explicitly requests someone to speak. No captions, "
        "logos or text overlays."
    )
    if total > 1:
        story += f" This is episode {episode} of {total} in a connected miniseries."
        if previous:
            story += " Previous episode continuity: " + previous[:1200]
    one(graph, "MinimaxStoryPlanner")[1]["inputs"].update({
        "story": story, "clip_count": 1, "dialogue": total > 1 or bool(re.search(r"\b(habla|dice|di[aÃ¡]logo|speak|says|voice)\b", idea, re.I)),
    })
    one(graph, "LoadImage")[1]["inputs"]["image"] = image_name
    one(graph, "KinevaStoryCastFromManifest")[1]["inputs"]["manifest_path"] = str(manifest_path)
    one(graph, "KinevaPlanLock")[1]["inputs"].update({
        "profile": "MINISERIES", "preserve_dialogue": False,
        "exact_dialogue": "", "force_single_take": False,
        "presenter_visible": False, "lock_camera": False,
        "project_id": "local_" + job_id,
    })
    one(graph, "KinevaStaticBackgroundLock")[1]["inputs"]["enabled"] = False
    graph = {key: node for key, node in graph.items()
             if node["class_type"] not in ("RemoveBackground", "LoadBackgroundRemovalModel")}
    one(graph, "KinevaPromptTrace")[1]["inputs"]["original_prompt"] = idea
    one(graph, "KinevaProjectContext")[1]["inputs"].update({
        "project_name": "kineva_local_" + job_id, "episode": episode,
        "scene": 1, "shot": 1, "take": 1,
    })
    one(graph, "KinevaRunManifest")[1]["inputs"]["project_name"] = "kineva_local_" + job_id
    return graph

def run_job(job_id, image, idea, count):
    try:
        with GPU_LOCK:
            template = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
            available = COMFY.call("GET", "/object_info")
            missing = {node["class_type"] for node in template.values()} - available.keys()
            if missing:
                raise RuntimeError("Faltan nodos ComfyUI: " + ", ".join(sorted(missing)))
            if not INPUT.is_dir() or not OUTPUT.is_dir():
                raise RuntimeError("No encuentro las carpetas input/output de ComfyUI.")
            extension = image_extension(image)
            image_name = "kineva_local/" + job_id + extension
            image_path = INPUT / image_name
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(image)
            manifest_path = INPUT / "kineva_local" / (job_id + "_cast.json")
            manifest_path.write_text(
                '{"version":1,"characters":{},"locations":{}}', encoding="utf-8")
            previous = ""
            for episode in range(1, count + 1):
                update(job_id, state="rendering", current=episode)
                graph = build_graph(
                    template, image_name, manifest_path, idea, job_id, episode, count, previous)
                export_node = one(graph, "KinevaMasterExport")[0]
                created = COMFY.call("POST", "/prompt", {
                    "prompt": graph, "client_id": "insomnia-local-creator",
                })
                if created.get("error") or not created.get("prompt_id"):
                    raise RuntimeError("ComfyUI rechazÃ³ la solicitud: " + str(created)[:400])
                video = wait_for_render(
                    COMFY, created["prompt_id"], export_node, interval=5, timeout=7200)
                filename = video["filename"]
                subfolder = Path(video.get("subfolder") or "")
                if (video.get("type") != "output" or Path(filename).name != filename
                        or subfolder.is_absolute() or ".." in subfolder.parts):
                    raise RuntimeError("ComfyUI devolviÃ³ una ruta de vÃ­deo invÃ¡lida.")
                path = OUTPUT / subfolder / filename
                if not path.is_file():
                    raise RuntimeError("El vÃ­deo exportado no existe.")
                video_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id]["videos"].append({
                        "episode": episode, "url": "/videos/" + job_id + "/" + video_id,
                        "path": str(path),
                    })
                try:
                    report = find_manifest(
                        OUTPUT, "kineva_local_" + job_id, filename)
                    locked = report.get("locked_plan") or {}
                    previous = json.dumps({
                        "cast": locked.get("cast"),
                        "scenes": locked.get("scenes"),
                    }, ensure_ascii=False)[:1200]
                    scenes = locked.get("scenes") or []
                    dialogue = [
                        str(line.get("line") or "") for shot in locked.get("shots") or []
                        for line in shot.get("dialogue") or []
                    ]
                    script = "\n".join(
                        [str(scene.get("summary") or "") for scene in scenes] + dialogue
                    ).strip()
                    with JOBS_LOCK:
                        JOBS[job_id]["videos"][-1]["script"] = script[:5000]
                except Exception:
                    previous = ""
            update(job_id, state="completed")
    except Exception as exc:
        update(job_id, state="failed", error=str(exc)[:700])

class Handler(BaseHTTPRequestHandler):
    def _origin(self):
        origin = self.headers.get("Origin", "")
        return origin if ALLOWED_ORIGINS.fullmatch(origin) else None

    def _reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        origin = self._origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if not self._origin():
            return self._reply(403, {"error": "Origen no permitido."})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self._origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parts = urlsplit(self.path).path.strip("/").split("/")
        if parts == ["health"]:
            try:
                COMFY.call("GET", "/system_stats")
                return self._reply(200, {"ready": TEMPLATE_PATH.is_file(),
                                         "comfy": True})
            except Exception:
                return self._reply(503, {"ready": False, "comfy": False})
        if len(parts) == 2 and parts[0] == "jobs":
            job = public_job(parts[1])
            return self._reply(200, job) if job else self._reply(404, {"error": "No existe."})
        if len(parts) == 3 and parts[0] == "videos":
            with JOBS_LOCK:
                job = JOBS.get(parts[1])
                found = next((v for v in job["videos"] if v["url"].endswith("/" + parts[2])),
                             None) if job else None
            if not found:
                return self._reply(404, {"error": "No existe."})
            path = Path(found["path"])
            size = path.stat().st_size
            header = self.headers.get("Range", "")
            selected = re.fullmatch(r"bytes=(\d+)-(\d*)", header)
            start = int(selected.group(1)) if selected else 0
            end = int(selected.group(2)) if selected and selected.group(2) else size - 1
            if start >= size or end < start or end >= size:
                return self._reply(416, {"error": "Rango de video invalido."})
            self.send_response(206 if selected else 200)
            origin = self._origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            if selected:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.end_headers()
            with path.open("rb") as source:
                source.seek(start)
                remaining = end - start + 1
                while remaining:
                    block = source.read(min(1024 * 1024, remaining))
                    if not block:
                        break
                    self.wfile.write(block)
                    remaining -= len(block)
            return
        return self._reply(404, {"error": "No existe."})

    def do_POST(self):
        if urlsplit(self.path).path != "/jobs":
            return self._reply(404, {"error": "No existe."})
        if not self._origin():
            return self._reply(403, {"error": "Abre Insomnia en esta PC."})
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 14_000_000:
            return self._reply(413, {"error": "La foto supera el lÃ­mite de 10 MB."})
        try:
            body = json.loads(self.rfile.read(length))
            idea = str(body.get("idea") or "").strip()
            if len(idea) < 5 or len(idea) > 1500:
                raise ValueError("Escribe una idea breve de 5 a 1500 caracteres.")
            count = int(body.get("episodes", 1))
            if count < 1 or count > 3:
                raise ValueError("Elige entre 1 y 3 episodios.")
            encoded = body.get("image")
            if not isinstance(encoded, str):
                raise ValueError("Sube una foto para animar.")
            image = base64.b64decode(encoded, validate=True)
            if not image or len(image) > MAX_IMAGE:
                raise ValueError("La foto debe pesar hasta 10 MB.")
            image_extension(image)
        except (ValueError, TypeError, binascii.Error, json.JSONDecodeError) as exc:
            return self._reply(400, {"error": str(exc)})
        job_id = str(uuid.uuid4())
        with JOBS_LOCK:
            JOBS[job_id] = {
                "id": job_id, "state": "queued", "current": 0,
                "total": count, "videos": [], "error": None,
            }
        threading.Thread(target=run_job, args=(job_id, image, idea, count),
                         daemon=True).start()
        return self._reply(202, public_job(job_id))

if __name__ == "__main__":
    print(f"Insomnia local Kineva: http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
