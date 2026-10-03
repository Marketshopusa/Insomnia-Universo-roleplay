#!/usr/bin/env python3
"""Insomnia scene images through local ComfyUI/Kineva. Requires a service-role key in env."""
import argparse
import json
import os
import struct
import sys
import time
from pathlib import Path
from urllib.parse import quote
from worker import Api, release_idle_models

MODEL = "flux-2-klein-4b-fp8.safetensors"
ENCODER = "qwen_3_4b_fp4_flux2.safetensors"
VAE = "flux2-vae.safetensors"

def graph_for(job):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": MODEL, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": ENCODER, "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": job["prompt"], "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0],
            "seed": int(job["id"].replace("-", "")[:12], 16), "steps": 4, "cfg": 1,
            "sampler_name": "euler", "scheduler": "simple", "positive": ["4", 0],
            "negative": ["5", 0], "latent_image": ["6", 0], "denoise": 1}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {
            "images": ["8", 0], "filename_prefix": "kineva_scenes/" + job["id"].replace("-", "")}},
    }

def scene_prompt(body):
    source = body or {}
    focus = str(source.get("focusText") or "").strip()[:1800]
    if len(focus) < 8:
        raise ValueError("La escena es demasiado corta para ilustrarla.")
    return "\n".join([
        "Create one vertical cinematic photorealistic still frame. Natural anatomy and lighting.",
        "The CURRENT action is the subject; preserve the established characters, wardrobe, location and chronology.",
        "No captions, speech bubbles, logos or collage.",
        "Story: " + str(source.get("storyTitle") or "")[:160],
        "Character identity: " + str(source.get("characterRole") or "")[:900],
        "Player role: " + str(source.get("playerRole") or "")[:250],
        "Premise: " + str(source.get("storyDescription") or "")[:650],
        "Recent context: " + str(source.get("sceneText") or "")[-1900:],
        "LATEST MOMENT: " + focus,
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

def render(job, comfy, output_dir, timeout=600):
    created = comfy.call("POST", "/prompt", {
        "prompt": graph_for(job), "client_id": "insomnia-kineva-scenes"})
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
    try:
        preflight(comfy)
        image = render(job, comfy, output_dir)
        path = job["owner_id"] + "/" + job["id"] + ".png"
        cloud.call("POST", "/storage/v1/object/kineva-scene-images/" + quote(path, safe="/"),
                   payload=image, raw=True,
                   headers={"Content-Type": "image/png", "x-upsert": "true"})
        result = {"status": "ready", "output_path": path, "error_message": None}
    except Exception as error:
        print("Image job failed", job["id"], repr(error), file=sys.stderr, flush=True)
        result = {"status": "failed", "error_message": str(error)[:350]}
    finally:
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
