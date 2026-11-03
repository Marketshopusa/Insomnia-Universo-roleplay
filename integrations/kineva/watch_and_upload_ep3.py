import os
import time
import json
import urllib.request
from pathlib import Path

SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleHptZWxzaHZiZ2FiaWh0ZnZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTcwMjg5MywiZXhwIjoyMTA1Mjc4ODkzfQ.23eLlrSfl8pVwc82dQxyft2xj1hJNefXNcQCINjda3M'
SUPABASE_URL = 'https://cexzmelshvbgabihtfvx.supabase.co'
EP3_ID = '45e6f8d8-2e49-4a9f-b452-d4a90519ef25'
P3 = Path(r'C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output\kineva_episodes\e04c4fae-6ec4-40d4-8554-0253772feaff\episode_03.mp4')

print('[Watcher EP3] Esperando archivo final episode_03.mp4...', flush=True)
while True:
    if P3.is_file() and P3.stat().st_size > 100000:
        time.sleep(3)  # ensure file is closed and fully written
        print(f'[Watcher EP3] Encontrado episode_03.mp4 ({P3.stat().st_size / (1024*1024):.2f} MB)! Subiendo...', flush=True)
        storage_path = f'episodes/{EP3_ID}.mp4'
        video_bytes = P3.read_bytes()
        
        up_url = f'{SUPABASE_URL}/storage/v1/object/shorts-media/{storage_path}'
        up_req = urllib.request.Request(
            up_url,
            data=video_bytes,
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Content-Type': 'video/mp4',
                'x-upsert': 'true'
            },
            method='POST'
        )
        with urllib.request.urlopen(up_req, timeout=120) as up_res:
            print(f'[Watcher EP3] Subido a Supabase Storage: {up_res.status}', flush=True)
            
        patch_url = f'{SUPABASE_URL}/rest/v1/shorts_episodes?id=eq.{EP3_ID}'
        patch_payload = {
            'status': 'ready',
            'video_url': storage_path
        }
        patch_req = urllib.request.Request(
            patch_url,
            data=json.dumps(patch_payload).encode('utf-8'),
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Content-Type': 'application/json'
            },
            method='PATCH'
        )
        with urllib.request.urlopen(patch_req, timeout=30) as patch_res:
            print(f'[Watcher EP3] shorts_episodes actualizado: {patch_res.status}', flush=True)
            
        print('[Watcher EP3] ¡CAPÍTULO 3 PUBLICADO CON ÉXITO!', flush=True)
        break
    time.sleep(10)
