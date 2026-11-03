import os
import sys
import time
import json
import base64
import urllib.request
from pathlib import Path

SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleHptZWxzaHZiZ2FiaWh0ZnZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTcwMjg5MywiZXhwIjoyMTA1Mjc4ODkzfQ.23eLlrSfl8pVwc82dQxyft2xj1hJNefXNcQCINjda3M"
SUPABASE_URL = "https://cexzmelshvbgabihtfvx.supabase.co"
LOCAL_KINEVA = "http://127.0.0.1:8787"

SERIES_ID = "024a7795-8f4e-474a-9e33-3637bfca24c3"
EPISODE_IDS = [
    "2b37cbc7-a256-40c9-9c29-91ee5d8b965b",  # Cap 1
    "aeb47b9a-7883-40c4-a453-68e0552e7e86",  # Cap 2
    "45e6f8d8-2e49-4a9f-b452-d4a90519ef25"   # Cap 3
]

# Read character references
p1_path = Path(r"C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input\kineva_local\04074b5c-92e5-457f-8ad5-8169f54f6e34.jpg")
p2_path = Path(r"C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input\kineva_local\04074b5c-92e5-457f-8ad5-8169f54f6e34_second.jpg")

p1_b64 = base64.b64encode(p1_path.read_bytes()).decode("utf-8") if p1_path.is_file() else None
p2_b64 = base64.b64encode(p2_path.read_bytes()).decode("utf-8") if p2_path.is_file() else None

# Multi-shot plans for 3 chapters: each has clean atomic actions
shot_plans = [
    # Capitulo 1
    [
        {
            "visual": "Cinematic vertical 9:16 establishing wide shot of a cold dark pine forest covered in dense night fog. Pale moonlight filtering through high branches.",
            "dialogue": "",
            "speaker": ""
        },
        {
            "visual": "Cinematic medium portrait of Diego with flashlight looking around with tense alert expression in misty woods.",
            "dialogue": "Diego: Escuché algo moverse... no estamos solos.",
            "speaker": "Diego"
        },
        {
            "visual": "Cinematic medium close-up of Elena turning around abruptly, eyes wide in fear looking into the deep darkness.",
            "dialogue": "Elena: Apaga la linterna... nos está observando.",
            "speaker": "Elena"
        }
    ],
    # Capitulo 2
    [
        {
            "visual": "Cinematic dynamic handheld tracking shot following two people fleeing through dark misty woods, swaying tree silhouettes.",
            "dialogue": "",
            "speaker": ""
        },
        {
            "visual": "Cinematic medium shot of Diego running breathlessly through shadows, glancing back with pure terror.",
            "dialogue": "Diego: ¡Corre, no mires atrás!",
            "speaker": "Diego"
        },
        {
            "visual": "Cinematic medium portrait of Elena sprinting with extreme desperation, gasping for air.",
            "dialogue": "Elena: ¡Está justo detrás de nosotros!",
            "speaker": "Elena"
        }
    ],
    # Capitulo 3
    [
        {
            "visual": "Cinematic vertical 9:16 shot of an empty asphalt road emerging from the dark forest edge under a flickering streetlight.",
            "dialogue": "",
            "speaker": ""
        },
        {
            "visual": "Cinematic medium shot of two exhausted hikers falling onto wet pavement, breathing heavily in relief.",
            "dialogue": "Diego: Llegamos al asfalto... salimos.",
            "speaker": "Diego"
        },
        {
            "visual": "Cinematic slow zoom toward the dark forest tree line where a sinister shadowy figure looms motionless in the fog.",
            "dialogue": "Elena: No pudo cruzar... pero sigue allí.",
            "speaker": "Elena"
        }
    ]
]

job_payload = {
    "image": p1_b64,
    "cast": {
        "primary_name": "Diego",
        "secondary_name": "Elena",
        "secondary_image": p2_b64,
        "location_name": "Bosque tenebroso con niebla densa"
    },
    "idea": "Dos excursionistas quedan atrapados en un bosque denso al anochecer. Una criatura espectral los acecha y persigue implacablemente hasta el límite de la carretera donde casi los aniquila.",
    "chapters": [
        "Capítulo 1: El Acecho entre los Pinos",
        "Capítulo 2: Huida en la Oscuridad",
        "Capítulo 3: El Límite del Asfalto"
    ],
    "dialogues": [
        "Diego: Escuché algo moverse... no estamos solos. | Elena: Apaga la linterna... nos está observando.",
        "Diego: ¡Corre, no mires atrás! | Elena: ¡Está justo detrás de nosotros!",
        "Diego: Llegamos al asfalto... salimos. | Elena: No pudo cruzar... pero sigue allí."
    ],
    "shot_plans": shot_plans,
    "title": "Pesadilla en el Bosque Negro"
}

print("[Kineva Auto-Publisher] Enviando trabajo de rodaje multi-toma a http://127.0.0.1:8787/jobs...", flush=True)
req = urllib.request.Request(
    f"{LOCAL_KINEVA}/jobs",
    data=json.dumps(job_payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=30) as res:
        job = json.loads(res.read().decode("utf-8"))
        job_id = job["id"]
        print(f"[Kineva Auto-Publisher] Trabajo creado exitosamente: {job_id}", flush=True)
except Exception as e:
    print(f"[Kineva Auto-Publisher] Error al crear trabajo local: {e}", flush=True)
    sys.exit(1)

def upload_and_publish_episode(ep_num, video_local_path):
    ep_id = EPISODE_IDS[ep_num - 1]
    storage_path = f"episodes/{ep_id}.mp4"
    print(f"[Kineva Auto-Publisher] Subiendo Capítulo {ep_num} a Supabase Storage: {storage_path}...", flush=True)
    
    video_bytes = Path(video_local_path).read_bytes()
    upload_url = f"{SUPABASE_URL}/storage/v1/object/shorts-media/{storage_path}"
    
    up_req = urllib.request.Request(
        upload_url,
        data=video_bytes,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "video/mp4",
            "x-upsert": "true"
        },
        method="POST"
    )
    with urllib.request.urlopen(up_req, timeout=120) as up_res:
        print(f"[Kineva Auto-Publisher] Capítulo {ep_num} subido exitosamente a Storage (HTTP {up_res.status}).", flush=True)
    
    # Update episode row in database
    patch_url = f"{SUPABASE_URL}/rest/v1/shorts_episodes?id=eq.{ep_id}"
    patch_payload = {
        "status": "ready",
        "video_url": storage_path
    }
    patch_req = urllib.request.Request(
        patch_url,
        data=json.dumps(patch_payload).encode("utf-8"),
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )
    with urllib.request.urlopen(patch_req, timeout=30) as patch_res:
        print(f"[Kineva Auto-Publisher] shorts_episodes actualizado para Capítulo {ep_num} (HTTP {patch_res.status}).", flush=True)

# Polling loop
published = set()
while True:
    try:
        status_req = urllib.request.Request(
            f"{LOCAL_KINEVA}/jobs/{job_id}",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(status_req, timeout=20) as s_res:
            current_job = json.loads(s_res.read().decode("utf-8"))
        
        state = current_job.get("state")
        current_ep = current_job.get("current", 1)
        videos = current_job.get("videos", [])
        
        print(f"[Kineva Poller] Estado: {state} | Episodio actual: {current_ep} | Videos listos: {len(videos)}", flush=True)

        if state in ("references_ready", "video_review"):
            print(f"[Kineva Poller] Auto-aprobando etapa '{state}' para continuar rodaje...", flush=True)
            try:
                app_req = urllib.request.Request(
                    f"{LOCAL_KINEVA}/jobs/{job_id}/approve",
                    data=b"{}",
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(app_req, timeout=10) as app_res:
                    print(f"[Kineva Poller] Aprobado exitosamente (HTTP {app_res.status}).", flush=True)
            except Exception as e:
                print(f"[Kineva Poller] Aviso aprobando: {e}", flush=True)
        
        for v in videos:
            ep_idx = v.get("episode")
            if ep_idx and ep_idx not in published:
                v_path = v.get("path")
                if v_path and os.path.isfile(v_path):
                    upload_and_publish_episode(ep_idx, v_path)
                    published.add(ep_idx)
        
        if state in ("completed", "done"):
            print(f"[Kineva Auto-Publisher] ¡SERIE COMPLETA GENERADA Y PUBLICADA! Total capítulos: {len(published)}", flush=True)
            break
        elif state == "failed":
            print(f"[Kineva Auto-Publisher] ERROR EN EL RENDER: {current_job.get('error')}", flush=True)
            break
            
    except Exception as poll_err:
        print(f"[Kineva Poller] Aviso durante sondeo: {poll_err}", flush=True)
        
    time.sleep(15)
