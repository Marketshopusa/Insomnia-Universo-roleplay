"""Local creator endpoint for Insomnia Studio. Run on the ComfyUI workstation."""
import base64
import binascii
import copy
import json
import os
import re
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from image_worker import COMFY_INPUT, preflight, render, save_cover_reference, scene_prompt
from worker import Api, find_manifest, one, probe_video, release_idle_models, wait_for_render
from image_quality import review
from studio_assembly import assemble_episode

HOST = "127.0.0.1"
PORT = int(os.environ.get("KINEVA_LOCAL_PORT", "8787"))
HOME = Path.home()
SHARED = HOME / "AppData/Local/Comfy-Desktop/ComfyUI-Shared"
INPUT = COMFY_INPUT
OUTPUT = Path(os.environ.get("KINEVA_COMFY_OUTPUT", str(SHARED / "output")))
TEMPLATE_PATH = Path(os.environ.get(
    "KINEVA_API_TEMPLATE",
    str(Path(__file__).resolve().parent / "workflows/KINEVA_MINISERIES_API_TEMPLATE.json"),
))
COMFY = Api(os.environ.get("KINEVA_COMFY_URL", "http://127.0.0.1:8188"))
STATE_PATH = HOME / "AppData/Local/Kineva/local-studio-jobs.json"
try:
    JOBS = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    if not isinstance(JOBS, dict):
        JOBS = {}
except (OSError, ValueError):
    JOBS = {}
for saved_job in JOBS.values():
    if saved_job.get("state") in ("queued", "rendering", "references_ready", "video_review"):
        saved_job.update(state="failed", error="El proceso local se reinició antes de aprobar la toma. Crea un nuevo trabajo.")
JOBS_LOCK = threading.Lock()
STATE_LOCK = threading.Lock()
GPU_LOCK = threading.Lock()
REVIEW_EVENTS = {}
REVIEW_DECISIONS = {}

def await_review(job_id, stage, timeout=86400):
    event = threading.Event()
    with JOBS_LOCK:
        REVIEW_EVENTS[job_id] = event
        JOBS[job_id]["state"] = stage
    persist_jobs()
    try:
        if not event.wait(timeout):
            raise RuntimeError("La revisión caducó. Inicia un nuevo render.")
        with JOBS_LOCK:
            approved = REVIEW_DECISIONS.pop(job_id, False)
        if not approved:
            raise RuntimeError("El usuario rechazó la toma. Ajusta las referencias o la escena y vuelve a generar.")
    finally:
        with JOBS_LOCK:
            REVIEW_EVENTS.pop(job_id, None)

# The browser on the Vercel Studio calls this loopback worker. Vercel itself never reaches the GPU.
ALLOWED_ORIGINS = re.compile(
    r"^(?:http://(?:localhost|127\.0\.0\.1):(?:8080|5173|5174)"
    r"|https://insomnia-universo-roleplay(?:-[a-z0-9-]+)?\.vercel\.app)$",
    re.IGNORECASE,
)
MAX_IMAGE = 10_000_000

def image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    raise ValueError("La foto debe ser PNG, JPEG o WebP.")

def decode_optional_image(encoded, label):
    if encoded in (None, ""):
        return b""
    if not isinstance(encoded, str):
        raise ValueError(label + ": formato de imagen inválido.")
    data = base64.b64decode(encoded, validate=True)
    if not data or len(data) > MAX_IMAGE:
        raise ValueError(label + ": la foto debe pesar hasta 10 MB.")
    image_extension(data)
    return data


def cast_spec(body):
    source = body.get("cast") or {}
    if not isinstance(source, dict):
        raise ValueError("Las fichas de reparto deben ser un objeto.")
    names = {}
    for field in ("primary_name", "primary_description", "secondary_name", "secondary_description", "location_name", "location_description"):
        value = str(source.get(field) or "").strip()
        if len(value) > (500 if field.endswith("_description") else 80):
            raise ValueError("La ficha de reparto es demasiado larga.")
        names[field] = value
    names["secondary_image"] = decode_optional_image(source.get("secondary_image"), "Segundo personaje")
    names["location_image"] = decode_optional_image(source.get("location_image"), "Lugar")
    if names["secondary_image"] and not names["secondary_name"]:
        raise ValueError("Asigna un nombre al segundo personaje.")
    if names["secondary_name"] and not (names["secondary_image"] or names["secondary_description"]):
        raise ValueError("Sube una referencia separada del segundo personaje o define su ficha visual.")
    if names["location_image"] and not names["location_name"]:
        raise ValueError("Asigna un nombre al lugar.")
    if names["secondary_name"].casefold() == names["primary_name"].casefold() and names["secondary_name"]:
        raise ValueError("Los personajes deben tener nombres distintos.")
    return names


def persist_jobs():
    with STATE_LOCK:
        with JOBS_LOCK:
            snapshot = copy.deepcopy(JOBS)
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_PATH.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        temporary.replace(STATE_PATH)

def update(job_id, **fields):
    with JOBS_LOCK:
        JOBS[job_id].update(fields)
    persist_jobs()

def public_job(job_id):
    with JOBS_LOCK:
        job = copy.deepcopy(JOBS.get(job_id))
    if job is None:
        return None
    job.pop("image", None)
    job.pop("idea", None)
    job.pop("reference_paths", None)
    if job.get("preview"):
        job["preview"] = {key: value for key, value in job["preview"].items() if key != "path"}
    job["videos"] = [{key: value for key, value in video.items() if key != "path"}
                     for video in job.get("videos", [])]
    return job

def build_graph(template, image_name, manifest_path, idea, job_id, episode, total, previous, cast=None, dialogue=""):
    graph = copy.deepcopy(template)
    if not image_name:
        raise ValueError("Kineva necesita una imagen inicial para esta toma.")
    cast = cast or {}
    story = idea.strip()
    if total > 1:
        story += f" This is episode {episode} of {total} in a connected miniseries."
        if previous:
            story += " Keep the same protagonist and established story prop; show only the current location and action."
    one(graph, "KinevaDirectShotPlan")[1]["inputs"].update({
        "prompt": story, "exact_dialogue": dialogue,
        "duration_seconds": min(15.08, max(5.17, 5.17 + len(idea) / 80)),
        "primary_character": cast.get("primary_name") or "the adult person in the uploaded reference image",
        "secondary_character": cast.get("secondary_name") or "",
        "location_name": cast.get("location_name") or "the setting in the uploaded reference image",
        "location_description": cast.get("location_description") or "Preserve the original room, geometry, lighting and surfaces.",
    })
    cast_inputs = one(graph, "KinevaStoryCastFromManifest")[1]["inputs"]
    cast_inputs["manifest_path"] = str(manifest_path)
    one(graph, "LoadImage")[1]["inputs"]["image"] = image_name
    cast_inputs["use_reference_image"] = True
    cast_inputs["use_reference_as_location"] = not bool(cast.get("location_image") or cast.get("location_description") or cast.get("secondary_name"))
    if not dialogue:
        one(graph, "KinevaVoiceRouter")[1]["inputs"]["mode"] = "NONE"
    one(graph, "KinevaPlanLock")[1]["inputs"].update({
        "profile": "MINISERIES", "preserve_dialogue": True,
        "exact_dialogue": dialogue, "force_single_take": False,
        "presenter_visible": False, "lock_camera": False,
        "project_id": "local_" + job_id,
    })
    director_id = one(graph, "MinimaxStoryDirector")[0]
    one(graph, "KinevaVideoQC")[1]["inputs"]["video"] = [director_id, 0]
    graph = {key: node for key, node in graph.items()
             if node["class_type"] not in (
                 "KinevaStaticBackgroundLock",
                 "RemoveBackground",
                 "LoadBackgroundRemovalModel",
             )}
    one(graph, "KinevaPromptTrace")[1]["inputs"]["original_prompt"] = idea
    one(graph, "KinevaProjectContext")[1]["inputs"].update({
        "project_name": "kineva_local_" + job_id, "episode": episode,
        "scene": 1, "shot": 1, "take": 1,
    })
    one(graph, "KinevaRunManifest")[1]["inputs"]["project_name"] = "kineva_local_" + job_id
    return graph

def chapter_ideas(body):
    raw = body.get("chapters")
    if isinstance(raw, list) and raw:
        ideas = []
        if len(raw) > 12:
            raise ValueError("Kineva admite hasta 12 capítulos por proyecto local.")
        for item in raw:
            text = str(item or "").strip()
            if len(text) < 5 or len(text) > 4000:
                raise ValueError("Cada capítulo debe tener entre 5 y 4000 caracteres.")
            ideas.append(text)
        if not ideas:
            raise ValueError("No hay capítulos para filmar.")
        return ideas
    idea = str(body.get("idea") or "").strip()
    if len(idea) < 5 or len(idea) > 1500:
        raise ValueError("Escribe una idea breve de 5 a 1500 caracteres.")
    count = int(body.get("episodes", 1))
    if count < 1 or count > 3:
        raise ValueError("Elige entre 1 y 3 episodios.")
    if count > 1:
        raise ValueError("Para varios episodios envía capítulos distintos; no se repetirá la misma idea.")
    return [idea]

def chapter_shots(body, ideas):
    raw = body.get("shot_plans")
    if raw is None:
        return [[{"visual": idea, "dialogue": (body.get("dialogues") or [""] * len(ideas))[index] if index < len(body.get("dialogues") or []) else ""}] for index, idea in enumerate(ideas)]
    if not isinstance(raw, list) or len(raw) != len(ideas):
        raise ValueError("El desglose de tomas debe corresponder a cada capítulo.")
    result = []
    for chapter in raw:
        if not isinstance(chapter, list) or not (1 <= len(chapter) <= 3):
            raise ValueError("Cada capítulo admite de una a tres tomas distintas.")
        shots = []
        for item in chapter:
            if not isinstance(item, dict):
                raise ValueError("Toma inválida.")
            visual = str(item.get("visual") or "").strip()
            dialogue = str(item.get("dialogue") or "").strip()
            if not (5 <= len(visual) <= 1200) or len(dialogue) > 180 or len(dialogue.split()) > 20:
                raise ValueError("Cada toma necesita una acción visible y una frase breve opcional.")
            shots.append({"visual": visual, "dialogue": dialogue})
        result.append(shots)
    if sum(map(len, result)) > 24:
        raise ValueError("Una serie local admite hasta 24 tomas por proyecto.")
    return result


def validate_video_report(report):
    qc = report.get("qc") or {}
    issues = qc.get("issues")
    if not isinstance(issues, list) or not qc.get("audio_present"):
        raise RuntimeError("Kineva no entregó un informe técnico y audio válidos.")
    if issues:
        raise RuntimeError("Toma rechazada por control de calidad: " + "; ".join(map(str, issues))[:350])


def review_video_people(path, max_people):
    duration = probe_video(path)[3]
    positions = sorted({0.25, duration / 2, max(0.25, duration - 0.3)})
    for second in positions:
        frame = subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{second:.3f}",
            "-i", str(path), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-",
        ], capture_output=True, check=True, timeout=30).stdout
        if not frame or not review(frame, max_people)["accepted"]:
            raise RuntimeError("Toma rechazada: aparecen personas extra en el video; revisa las referencias.")


def create_shot_reference(job_id, episode, shot_index, visual, cast, source_names):
    """Make a distinct, reviewable first frame for each shot from cast references."""
    prompt = (
        "One coherent photorealistic cinematic film frame, one instant in one location. "
        "Depict this visible action exactly: " + visual[:1200] + ". "
        "Image 1 identifies the primary adult, not the location or camera pose. "
        "Keep that person's face, age, hair and build. "
    )
    if cast.get("secondary_name"):
        prompt += (
            "Image 2 identifies the second adult separately; never merge their faces or bodies. "
            "Primary: " + cast.get("primary_name", "primary") + ". "
            "Second: " + cast["secondary_name"] + ". "
        )
    if cast.get("location_name"):
        prompt += "Location: " + cast["location_name"] + ". " + cast.get("location_description", "")[:350] + ". "
    prompt += "Exactly the participants in the action, distinct anatomically complete people. No duplicates, collage, captions or extra limbs."
    seed_id = str(uuid.uuid5(uuid.UUID(job_id), f"shot-{episode}-{shot_index}"))
    max_people = 2 if cast.get("secondary_name") else 1
    image = None
    for attempt in range(3):
        candidate = render({"id": seed_id, "prompt": prompt, "reference_names": source_names},
                           COMFY, OUTPUT, attempt=attempt, timeout=900)
        result = review(candidate, max_people)
        if result["accepted"] and result["face_count"] >= 1:
            image = candidate
            break
    if image is None:
        raise RuntimeError("La imagen inicial de esta toma no conservó los personajes; revisa sus fichas.")
    name = f"kineva_local/{job_id}_ep{episode}_shot{shot_index}.png"
    path = INPUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(image)
    return name


def run_job(job_id, image, ideas, cast=None, shot_plans=None):
    try:
        with GPU_LOCK:
            template = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
            available = COMFY.call("GET", "/object_info")
            missing = {node["class_type"] for node in template.values()} - available.keys()
            if missing:
                raise RuntimeError("Faltan nodos ComfyUI: " + ", ".join(sorted(missing)))
            if not INPUT.is_dir() or not OUTPUT.is_dir():
                raise RuntimeError("No encuentro las carpetas input/output de ComfyUI.")
            cast = cast or {}
            if not image:
                preflight(COMFY)
                primary_prompt = (
                    "Single adult character portrait, one person only, neutral expression, "
                    "face and upper body visible, realistic photographic lighting, plain backdrop. "
                    "No text. Appearance: " + cast["primary_description"]
                    if cast.get("primary_description")
                    else scene_prompt({"focusText": ideas[0]})
                )
                image = render(
                    {"id": str(uuid.uuid5(uuid.UUID(job_id), "primary")),
                     "prompt": primary_prompt},
                    COMFY, OUTPUT, timeout=900)
            if cast.get("secondary_name") and not cast.get("secondary_image"):
                preflight(COMFY)
                cast["secondary_image"] = render(
                    {"id": str(uuid.uuid5(uuid.UUID(job_id), "secondary")),
                     "prompt": "Single adult character portrait, one person only, neutral expression, "
                     "face and upper body visible, realistic photographic lighting, plain backdrop. "
                     "No text. Appearance: " + cast["secondary_description"]},
                    COMFY, OUTPUT, timeout=900)
            if cast.get("location_name") and cast.get("location_description") and not cast.get("location_image"):
                preflight(COMFY)
                cast["location_image"] = render(
                    {"id": str(uuid.uuid5(uuid.UUID(job_id), "location")),
                     "prompt": "Empty establishing photograph of a location, no people, no faces, "
                     "realistic natural light, no text. Place: " + cast["location_name"] + ". "
                     + cast["location_description"]},
                    COMFY, OUTPUT, timeout=900)
            extension = image_extension(image)
            image_name = "kineva_local/" + job_id + extension
            image_path = INPUT / image_name
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(image)
            cast = cast or {}
            manifest_path = INPUT / "kineva_local" / (job_id + "_cast.json")
            references = {"version": 1, "characters": {}, "locations": {}}
            if cast.get("secondary_image"):
                data = cast["secondary_image"]
                filename = job_id + "_second" + image_extension(data)
                (manifest_path.parent / filename).write_bytes(data)
                references["characters"][cast["secondary_name"]] = filename
            if cast.get("location_image"):
                data = cast["location_image"]
                filename = job_id + "_location" + image_extension(data)
                (manifest_path.parent / filename).write_bytes(data)
                references["locations"][cast["location_name"]] = filename
            manifest_path.write_text(json.dumps(references, ensure_ascii=False), encoding="utf-8")
            reference_paths = {"primary": str(image_path)}
            if cast.get("secondary_image"):
                reference_paths["secondary"] = str(manifest_path.parent / references["characters"][cast["secondary_name"]])
            if cast.get("location_image"):
                reference_paths["location"] = str(manifest_path.parent / references["locations"][cast["location_name"]])
            with JOBS_LOCK:
                JOBS[job_id]["reference_paths"] = reference_paths
                JOBS[job_id]["references"] = {key: "/references/" + job_id + "/" + key for key in reference_paths}
            persist_jobs()
            await_review(job_id, "references_ready")
            preflight(COMFY)
            source_names = [image_name]
            if cast.get("secondary_image"):
                source_names.append("kineva_local/" + references["characters"][cast["secondary_name"]])
            if cast.get("location_image"):
                source_names.append("kineva_local/" + references["locations"][cast["location_name"]])
            previous = ""
            count = len(ideas)
            shot_plans = shot_plans or [[{"visual": idea, "dialogue": ""}] for idea in ideas]
            for episode, chapter in enumerate(shot_plans, start=1):
                approved_shots = []
                episode_scripts = []
                for shot_index, shot in enumerate(chapter, start=1):
                    idea = shot["visual"]
                    update(job_id, state="rendering", current=episode)
                    dialogue = shot["dialogue"]
                    shot_image_name = create_shot_reference(
                        job_id, episode, shot_index, idea, cast, source_names)
                    graph = build_graph(
                        template, shot_image_name, manifest_path, idea, job_id, episode, count, previous, cast, dialogue)
                    one(graph, "KinevaProjectContext")[1]["inputs"]["shot"] = shot_index
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
                    report = find_manifest(OUTPUT, "kineva_local_" + job_id, filename)
                    validate_video_report(report)
                    if cast.get("secondary_name") or cast.get("primary_name"):
                        review_video_people(path, 2 if cast.get("secondary_name") else 1)
                    locked = report.get("locked_plan") or {}
                    previous = idea.strip()[:240]
                    scenes = locked.get("scenes") or []
                    dialogue = [
                        str(line.get("line") or "") for shot in locked.get("shots") or []
                        for line in shot.get("dialogue") or []
                    ]
                    script = "\n".join(
                        [str(scene.get("summary") or "") for scene in scenes] + dialogue
                    ).strip()
                    video_id = str(uuid.uuid4())
                    with JOBS_LOCK:
                        JOBS[job_id]["preview"] = {
                            "episode": episode, "shot": shot_index, "total_shots": len(chapter),
                            "url": "/videos/" + job_id + "/" + video_id,
                            "path": str(path), "script": script[:5000],
                        }
                    persist_jobs()
                    await_review(job_id, "video_review")
                    approved_shots.append(path)
                    episode_scripts.append(script)
                    with JOBS_LOCK:
                        JOBS[job_id]["preview"] = None
                    persist_jobs()
                if len(approved_shots) == 1:
                    final_path = approved_shots[0]
                else:
                    final_path = OUTPUT / "kineva_episodes" / job_id / f"episode_{episode:02d}.mp4"
                    assemble_episode(approved_shots, final_path)
                video_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id]["videos"].append({
                        "episode": episode, "url": "/videos/" + job_id + "/" + video_id,
                        "path": str(final_path), "script": "\n".join(episode_scripts)[:5000], "approved": True,
                    })
                persist_jobs()
            update(job_id, state="completed")
    except Exception as exc:
        update(job_id, state="failed", error=str(exc)[:700])
    finally:
        release_idle_models(COMFY)

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
            self.send_header("Access-Control-Allow-Private-Network", "true")
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
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parts = urlsplit(self.path).path.strip("/").split("/")
        if parts == ["health"]:
            template = TEMPLATE_PATH.is_file()
            try:
                COMFY.call("GET", "/system_stats")
                comfy = True
            except Exception:
                comfy = False
            ready = template and comfy
            return self._reply(200 if ready else 503, {
                "ready": ready, "template": template, "comfy": comfy, "scenes": True,
            })
        if len(parts) == 2 and parts[0] == "jobs":
            job = public_job(parts[1])
            return self._reply(200, job) if job else self._reply(404, {"error": "No existe."})
        if len(parts) == 3 and parts[0] == "references":
            with JOBS_LOCK:
                source = (JOBS.get(parts[1]) or {}).get("reference_paths", {}).get(parts[2])
            if not source:
                return self._reply(404, {"error": "No existe."})
            path = Path(source)
            if not path.is_file():
                return self._reply(404, {"error": "No existe."})
            data = path.read_bytes()
            self.send_response(200)
            origin = self._origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Type", "image/png" if path.suffix.lower() == ".png" else "image/jpeg" if path.suffix.lower() == ".jpg" else "image/webp")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if len(parts) == 3 and parts[0] == "videos":
            with JOBS_LOCK:
                job = JOBS.get(parts[1])
                found = next((v for v in job["videos"] if v["url"].endswith("/" + parts[2])),
                             None) if job else None
                if not found and job and job.get("preview") and job["preview"]["url"].endswith("/" + parts[2]):
                    found = job["preview"]
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
                self.send_header("Access-Control-Allow-Private-Network", "true")
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

    def _scene(self):
        if not self._origin():
            return self._reply(403, {"error": "Abre Insomnia en esta PC."})
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 200_000:
            return self._reply(413, {"error": "La solicitud de la escena es demasiado grande."})
        try:
            body = json.loads(self.rfile.read(length))
            prompt = scene_prompt(body)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return self._reply(400, {"error": str(exc)})
        if not OUTPUT.is_dir():
            return self._reply(503, {"error": "No encuentro la carpeta de salida de ComfyUI."})
        job_id = str(uuid.uuid4())
        reference_name = None
        try:
            reference_name = save_cover_reference(body.get("coverImageUrl"), job_id)
            with GPU_LOCK:
                preflight(COMFY)
                png = render({"id": job_id, "prompt": prompt, "reference_name": reference_name}, COMFY, OUTPUT, timeout=180)
        except Exception as exc:
            return self._reply(503, {"error": str(exc)[:350]})
        finally:
            if reference_name:
                (COMFY_INPUT / reference_name).unlink(missing_ok=True)
            release_idle_models(COMFY)
        return self._reply(200, {"image": base64.b64encode(png).decode("ascii")})

    def do_POST(self):
        match = re.fullmatch(r"/jobs/([0-9a-f-]{36})/(approve|reject)", urlsplit(self.path).path)
        if match:
            if not self._origin():
                return self._reply(403, {"error": "Abre Insomnia en esta PC."})
            with JOBS_LOCK:
                event = REVIEW_EVENTS.get(match.group(1))
                state = (JOBS.get(match.group(1)) or {}).get("state")
                accepted = bool(event and not event.is_set() and state in ("references_ready", "video_review"))
                if accepted:
                    REVIEW_DECISIONS[match.group(1)] = match.group(2) == "approve"
                    event.set()
            return self._reply(200, {"accepted": True}) if accepted else self._reply(409, {"error": "Esta revisión ya no está pendiente."})
        if urlsplit(self.path).path == "/scenes":
            return self._scene()
        if urlsplit(self.path).path != "/jobs":
            return self._reply(404, {"error": "No existe."})
        if not self._origin():
            return self._reply(403, {"error": "Abre Insomnia en esta PC."})
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 43_000_000:
            return self._reply(413, {"error": "La solicitud supera el limite permitido."})
        try:
            body = json.loads(self.rfile.read(length))
            ideas = chapter_ideas(body)
            count = len(ideas)
            image = decode_optional_image(body.get("image"), "Personaje principal")
            cast = cast_spec(body)
            raw_dialogues = body.get("dialogues") or []
            if not isinstance(raw_dialogues, list) or len(raw_dialogues) > len(ideas):
                raise ValueError("Las frases no corresponden a los capítulos.")
            dialogues = [str(line or "").strip() for line in raw_dialogues]
            shot_plans = chapter_shots(body, ideas)
            if any(len(line) > 180 or len(line.split()) > 20 for line in dialogues):
                raise ValueError("Cada toma admite una frase breve de hasta 20 palabras.")
            if cast["secondary_name"] and not (image or cast["primary_description"]):
                raise ValueError("Sube una referencia del personaje principal o define su ficha visual.")
        except (ValueError, TypeError, binascii.Error, json.JSONDecodeError) as exc:
            return self._reply(400, {"error": str(exc)})
        job_id = str(uuid.uuid4())
        with JOBS_LOCK:
            JOBS[job_id] = {
                "id": job_id, "state": "queued", "current": 0,
                "total": count, "videos": [], "error": None,
            }
        persist_jobs()
        threading.Thread(target=run_job, args=(job_id, image, ideas, cast, shot_plans),
                         daemon=True).start()
        return self._reply(202, public_job(job_id))

if __name__ == "__main__":
    print(f"Insomnia local Kineva: http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
