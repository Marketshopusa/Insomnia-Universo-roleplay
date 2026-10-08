#!/usr/bin/env python3
"""Insomnia scene images through local ComfyUI/Kineva. Requires a service-role key in env."""
import argparse
import json
import os
import re
import subprocess
import struct
import sys
import time
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError
from urllib.parse import quote, urlsplit
from urllib.request import urlopen
from worker import Api, release_idle_models
from image_quality import review

MODEL = "flux-2-klein-4b-fp8.safetensors"
ENCODER = "qwen_3_4b_fp4_flux2.safetensors"
VAE = "flux2-vae.safetensors"
COMFY_INPUT = Path(os.environ.get("KINEVA_COMFY_INPUT", str(Path.home() / "AppData/Local/Comfy-Desktop/ComfyUI-Shared/input")))


def save_cover_reference(url, job_id):
    if not url:
        return None
    parsed = urlsplit(str(url))
    if parsed.scheme != "https" or parsed.hostname != "cexzmelshvbgabihtfvx.supabase.co" or not parsed.path.startswith("/storage/v1/object/public/"):
        raise ValueError("La portada debe ser una imagen pública de este proyecto Supabase.")
    with urlopen(str(url), timeout=12) as response:
        if urlsplit(response.geturl()).hostname != parsed.hostname:
            raise ValueError("La portada redirigió fuera del almacenamiento permitido.")
        data = response.read(40_000_001)
    is_png = data.startswith(b"\x89PNG\r\n\x1a\n")
    is_jpeg = data.startswith(b"\xff\xd8\xff")
    is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    is_video = data[4:8] == b"ftyp" or data[:4] == b"\x1a\x45\xdf\xa3"
    if len(data) > (20_000_000 if is_video else 40_000_000) or not (is_png or is_jpeg or is_webp or is_video):
        raise ValueError("La portada debe ser imagen de hasta 40 MB o video de hasta 20 MB.")
    stem = "kineva_scene_reference_" + re.sub(r"[^a-f0-9]", "", job_id.lower())
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    if is_video:
        video_path = COMFY_INPUT / (stem + (".mp4" if data[4:8] == b"ftyp" else ".webm"))
        frame_path = COMFY_INPUT / (stem + ".png")
        try:
            video_path.write_bytes(data)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video_path),
                            "-frames:v", "1", "-vf", "scale=768:-2", str(frame_path)],
                           check=True, timeout=25, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if not frame_path.is_file() or frame_path.stat().st_size < 1000:
                raise ValueError("No se pudo extraer la imagen del video de portada.")
            return frame_path.name
        finally:
            video_path.unlink(missing_ok=True)
    # The cover may be a large original; Comfy only needs a bounded reference.
    # Decode and orient it before resampling, so large PNGs and phone photos work.
    name = stem + ".jpg"
    try:
        Image.MAX_IMAGE_PIXELS = 40_000_000
        with Image.open(BytesIO(data)) as source:
            source.load()
            reference = ImageOps.exif_transpose(source).convert("RGB")
            reference.thumbnail((1024, 1536), Image.Resampling.LANCZOS)
            reference.save(COMFY_INPUT / name, "JPEG", quality=91, optimize=True)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise ValueError("No se pudo leer la portada como imagen.") from error
    return name


def graph_for(job, attempt=0):
    graph = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODEL, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": ENCODER, "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0],
            "seed": int(job["id"].replace("-", "")[:12], 16) + attempt, "steps": 4, "cfg": 1,
            "sampler_name": "euler", "scheduler": "simple", "positive": ["4", 0],
            "negative": ["5", 0], "latent_image": ["6", 0], "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {
            "images": ["8", 0], "filename_prefix": "kineva_scenes/" + job["id"].replace("-", "")}},
    }
    if job.get("reference_name"):
        graph["10"] = {"class_type": "LoadImage", "inputs": {"image": job["reference_name"]}}
        graph["11"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["3", 0]}}
        graph["12"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["4", 0], "latent": ["11", 0]}}
        graph["13"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["5", 0], "latent": ["11", 0]}}
        graph["7"]["inputs"]["positive"] = ["12", 0]
        graph["7"]["inputs"]["negative"] = ["13", 0]
    return graph

def visible_moment(text):
    compact = re.sub(r"\s+", " ", str(text or "")).strip()
    return compact if len(compact) <= 500 else compact[:240].rstrip() + " … " + compact[-250:].lstrip()


def current_location(text):
    words = str(text or "").lower()
    places = (
        (r"\b(?:veh[ií]culo|autom[oó]vil|carro|coche|taxi|camioneta)\b", "inside a vehicle"),
        (r"\b(?:habitaci[oó]n|dormitorio|cama|bedroom|bed)\b", "in a bedroom"),
        (r"\b(?:cocina|kitchen)\b", "in a kitchen"),
        (r"\b(?:biblioteca|library)\b", "in a library"),
        (r"\b(?:calle|street)\b", "on a street"),
    )
    matches = [(m.start(), place) for pattern, place in places for m in re.finditer(pattern, words)]
    return max(matches)[1] if matches else ""


def scene_prompt(body):
    source = body or {}
    focus = str(source.get("focusText") or "").strip()
    if len(focus) < 8:
        raise ValueError("La escena es demasiado corta para ilustrarla.")
    # Dialogue, old turns and long premises make this small image model draw a
    # storyboard with bogus subtitles. Describe only one visible current action.
    actions = re.findall(r"\*([^*]{3,5000})\*", focus)
    moment = actions[-1].strip() if actions else re.split(r"[.!?](?:\s|$)", focus, maxsplit=1)[0].strip()
    moment = visible_moment(moment)
    user_text = str(source.get("userAction") or "")
    user_actions = re.findall(r"\*([^*]{3,5000})\*", user_text)
    user_moment = user_actions[-1].strip() if user_actions else ""
    if not user_moment and re.search(r"\b(?:abro|abre|entra|camina|toma|sujeta|entrego|coloca|mira|se levanta|me levanto)\b", user_text, re.I):
        user_moment = re.split(r"[.!?](?:\s|$)", user_text, maxsplit=1)[0].strip()
    recent_action = str(source.get("recentVisualAction") or "")
    prior_actions = re.findall(r"\*([^*]{3,5000})\*", recent_action)
    user_moment = visible_moment(user_moment or (prior_actions[-1].strip() if prior_actions else ""))
    location = current_location(user_text) or current_location(recent_action) or current_location(focus)
    context = re.sub(r"\*[^*]*\*", " ", str(source.get("sceneText") or ""))
    context = location or re.sub(r"\s+", " ", context).strip()[-120:]
    return "\n".join([
        "One realistic vertical photograph of the current moment. Frame the described action in one coherent setting.",
        "Current setting cues only: " + context + ". This current place overrides the background of Image 1; do not copy its room, furniture or previous scene.",
        "Show each described adult once in a distinct position. Only the participants in this moment; no bystanders, duplicate people or extra limbs.",
        "PLAYER visible action: " + (user_moment or "none described"),
        "CHARACTER visible reaction: " + moment,
        "Main character: " + str(source.get("characterRole") or "the main character")[:120],
        "Image 1 is an appearance reference for the main character only, not a scene or pose template. If two adults appear there, keep their faces on their own bodies.",
        "Other person only if present in this instant: " + str(source.get("playerRole") or "")[:100],
        "Depict the specific visible action between the participants rather than substituting a different activity. Keep anatomy, contact, clothing and lighting coherent. No lettering, subtitles or panels.",
    ])

def preflight(comfy):
    try:
        info = comfy.call("GET", "/object_info")
    except Exception as error:
        raise RuntimeError("No hay conexión con ComfyUI en 127.0.0.1:8188.") from error
    expected = [("UNETLoader", "unet_name", MODEL),
                ("CLIPLoader", "clip_name", ENCODER),
                ("VAELoader", "vae_name", VAE)]
    for node, field, model in expected:
        if model not in info[node]["input"]["required"][field][0]:
            raise RuntimeError("Falta el modelo de imagen en ComfyUI: " + model)
    for node in ("EmptyFlux2LatentImage", "ConditioningZeroOut", "KSampler", "VAEDecode", "SaveImage"):
        if node not in info:
            raise RuntimeError("Falta el nodo de ComfyUI: " + node)

def render(job, comfy, output_dir, timeout=600, attempt=0):
    created = comfy.call("POST", "/prompt", {
        "prompt": graph_for(job, attempt), "client_id": "insomnia-kineva-scenes"})
    if not created.get("prompt_id"):
        raise RuntimeError("ComfyUI rechazó la ilustración: " + str(created)[:500])
    prompt_id = created["prompt_id"]
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        history = comfy.call("GET", "/history/" + quote(prompt_id)).get(prompt_id)
        if history:
            if history.get("status", {}).get("status_str") != "success":
                raise RuntimeError("ComfyUI no pudo ilustrar la escena: " +
                                   str(history.get("status", {}).get("messages", []))[-600:])
            images = history.get("outputs", {}).get("9", {}).get("images", [])
            if len(images) != 1:
                raise RuntimeError("ComfyUI no devolvió la imagen de la escena.")
            image = images[0]
            if image.get("type") != "output":
                raise RuntimeError("Unexpected image output type")
            name = Path(image["filename"])
            folder = Path(image.get("subfolder") or "")
            if name.name != str(name) or folder.is_absolute() or ".." in folder.parts:
                raise RuntimeError("Unsafe image path")
            result = output_dir / folder / name
            data = result.read_bytes()
            if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) > 10_000_000:
                raise RuntimeError("Invalid Kineva image output")
            width, height = struct.unpack(">II", data[16:24])
            if width < 512 or height < 512:
                raise RuntimeError("Image resolution below minimum")
            return data
        time.sleep(2)
    raise TimeoutError("ComfyUI no terminó la ilustración a tiempo.")

def process_one(cloud, comfy, output_dir):
    claimed = cloud.call("POST", "/rest/v1/rpc/claim_kineva_scene_job", {})
    if not claimed:
        return False
    job = claimed[0]
    print("Image job claimed", job["id"], flush=True)
    result = {}
    reference_name = None
    try:
        stored_prompt = job["prompt"]
        if stored_prompt.startswith('{"scene_prompt":'):
            settings = json.loads(stored_prompt)
            job["prompt"] = settings["scene_prompt"]
            job["max_people"] = settings.get("max_people")
            reference_name = save_cover_reference(settings.get("cover_url"), job["id"])
            job["reference_name"] = reference_name
            print("Image reference attached", job["id"], bool(reference_name), flush=True)
        preflight(comfy)
        image = None
        for attempt in range(3):
            candidate = render(job, comfy, output_dir, attempt=attempt)
            result_check = review(candidate, job.get("max_people"))
            print("Image candidate", job["id"], attempt + 1, result_check, flush=True)
            if result_check["accepted"]:
                image = candidate
                break
        if image is None:
            raise RuntimeError("La ilustración mostró más personas de las descritas tras tres intentos. Revisa la escena.")
        path = job["owner_id"] + "/" + job["id"] + ".png"
        cloud.call("POST", "/storage/v1/object/kineva-scene-images/" + quote(path, safe="/"),
                   payload=image, raw=True,
                   headers={"Content-Type": "image/png", "x-upsert": "true"})
        result = {"status": "ready", "output_path": path, "error_message": None}
    except Exception as error:
        print("Image job failed", job["id"], repr(error), file=sys.stderr, flush=True)
        result = {"status": "failed", "error_message": str(error)[:350]}
    finally:
        if reference_name:
            (COMFY_INPUT / reference_name).unlink(missing_ok=True)
        release_idle_models(comfy)
    result["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result["updated_at"] = result["finished_at"]
    cloud.call("PATCH", "/rest/v1/kineva_scene_jobs?id=eq." + quote(job["id"]) +
               "&status=eq.running", result, headers={"Prefer": "return=representation"})
    print("Image job", job["id"], result["status"], flush=True)
    return True

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    comfy = Api(os.environ.get("KINEVA_COMFY_URL", "http://127.0.0.1:8188"))
    if args.preflight:
        preflight(comfy)
        print("Kineva still-image preflight OK", flush=True)
        return
    cloud = Api(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    failures = 0
    while True:
        try:
            worked = process_one(cloud, comfy, args.output_dir)
            failures = 0
        except Exception as error:
            failures += 1
            print("Image worker connection error:", ascii(error)[:350],
                  file=sys.stderr, flush=True)
            if args.once:
                raise
            time.sleep(min(60, 3 * 2 ** min(failures, 4)))
            continue
        if args.once:
            break
        if not worked:
            time.sleep(4)

if __name__ == "__main__":
    main()
