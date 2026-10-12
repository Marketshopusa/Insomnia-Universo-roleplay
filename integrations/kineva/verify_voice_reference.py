"""Audition the actual H3 voice branch before another full video render."""
from pathlib import Path
import base64
import datetime
import hashlib
import json
import subprocess
import time
import uuid

from local_creator import build_graph, COMFY, INPUT, OUTPUT, TEMPLATE_PATH
from worker import load_api_template, release_idle_models

def main():
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    folder = Path(__file__).resolve().parents[2] / "docs/evidence" / ("voice_es_" + stamp)
    folder.mkdir(parents=True)
    reference = "kineva_local/f1a169a8-5ab8-419f-abbe-c230511767c0_ep1_shot1.png"
    if not (INPUT / reference).is_file():
        raise RuntimeError("Previous Studio image reference is missing")
    queue = COMFY.call("GET", "/queue")
    if queue["queue_running"] or queue["queue_pending"]:
        raise RuntimeError("ComfyUI is busy")
    job_id = str(uuid.uuid4())
    manifest = INPUT / "kineva_local" / (job_id + "_cast.json")
    manifest.write_text('{"version":1,"characters":{},"locations":{}}')
    graph = build_graph(load_api_template(TEMPLATE_PATH), reference, manifest,
        "Presentador sentado frente a su micrófono.", job_id, 1, 1, "",
        dialogue="Bienvenidos a este episodio sobre las novedades de inteligencia artificial.")
    graph["99"] = {"class_type": "SaveAudio", "inputs": {
        "audio": ["51", 1], "filename_prefix": "audio/Kineva_Voz_Espanol_" + stamp}}
    required = set()
    def include(key):
        if key in required:
            return
        required.add(key)
        for value in graph[key]["inputs"].values():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and value[0] in graph:
                include(value[0])
    include("99")
    graph = {key: node for key, node in graph.items() if key in required}
    (folder / "submitted_graph.json").write_text(json.dumps(graph, indent=2, ensure_ascii=True))
    created = COMFY.call("POST", "/prompt", {"prompt": graph, "client_id": "kineva-voice-es-review"})
    if not created.get("prompt_id"):
        raise RuntimeError(json.dumps(created))
    prompt_id = created["prompt_id"]
    (folder / "provenance.json").write_text(json.dumps({
        "prompt_id": prompt_id, "template": str(TEMPLATE_PATH), "language": "Spanish",
        "reference_text": graph["51"]["inputs"]["reference_text"],
        "voice_policy": "language-aware reference and voice_v2 cache",
        "scope": "H3 voice reference audition only; final video dialogue not regenerated",
    }, indent=2, ensure_ascii=True))
    print("SUBMITTED", prompt_id, "EVIDENCE", folder, flush=True)
    end = time.monotonic() + 1800
    while time.monotonic() < end:
        history = COMFY.call("GET", "/history/" + prompt_id).get(prompt_id)
        if history:
            if history["status"]["status_str"] != "success":
                raise RuntimeError(json.dumps(history["status"]))
            files = history["outputs"]["99"].get("audio", [])
            if not files:
                raise RuntimeError(json.dumps(history["outputs"]["99"]))
            file = files[0]
            source = OUTPUT / file.get("subfolder", "") / file["filename"]
            destination = Path.home() / "Documents/Kineva-Workflows/RESULTADOS_VERIFICADOS" / ("KINEVA_VOZ_ESPANOL_" + stamp + ".wav")
            subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-i", str(source),
                "-c:a", "pcm_s16le", str(destination)], check=True, timeout=60)
            decoded = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-i", str(destination),
                "-f", "null", "-"], capture_output=True, text=True, timeout=30)
            if decoded.returncode or decoded.stderr.strip():
                raise RuntimeError("Audio decode failed: " + decoded.stderr)
            probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams",
                "-show_format", "-of", "json", str(destination)], capture_output=True,
                text=True, check=True, timeout=30).stdout)
            data = destination.read_bytes()
            transfer = destination.with_suffix(".transfer.txt")
            chunks = [base64.b64encode(data[i:i+32768]).decode() for i in range(0,len(data),32768)]
            transfer.write_text("\n".join("DATA:" + chunk for chunk in chunks) + "\n")
            result = {"file": str(destination), "duration": float(probe["format"]["duration"]),
                "sample_rate": probe["streams"][0]["sample_rate"], "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(), "chunks": len(chunks),
                "transfer": str(transfer), "prompt_id": prompt_id, "decode": "passed",
                "scope": "voice reference sample, not the final video voice"}
            (folder / "result.json").write_text(json.dumps(result, indent=2))
            (folder / "history.json").write_text(json.dumps(history, indent=2))
            print("COMPLETE", json.dumps(result), flush=True)
            release_idle_models(COMFY)
            return
        time.sleep(5)
    raise TimeoutError("Voice audition did not finish")

if __name__ == "__main__":
    main()
