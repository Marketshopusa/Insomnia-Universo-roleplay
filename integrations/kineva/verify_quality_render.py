"""Render the real Studio graph on local ComfyUI, retaining exact graph provenance."""
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sys
import uuid

from local_creator import build_graph, COMFY, INPUT, OUTPUT, TEMPLATE_PATH, validate_video_report
from worker import load_api_template, one, find_manifest, wait_for_render, probe_video
from video_quality import inspect

def main():
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    evidence = Path(__file__).resolve().parents[2] / "docs/evidence" / ("quality_" + stamp)
    evidence.mkdir(parents=True)
    master = Path.home() / "Documents/Kineva-Workflows/ACTIVE/KINEVA_WORKFLOW_MASTER_QUALITY.json"
    master_before = hashlib.sha256(master.read_bytes()).hexdigest()
    template = load_api_template(TEMPLATE_PATH)
    queue = COMFY.call("GET", "/queue")
    if queue["queue_running"] or queue["queue_pending"]:
        raise RuntimeError("Existing render is active; do not interfere with it")
    reference = INPUT / "kineva_local/f1a169a8-5ab8-419f-abbe-c230511767c0_ep1_shot1.png"
    if not reference.is_file():
        raise RuntimeError("The previous Studio shot reference is missing")
    job_id = str(uuid.uuid4())
    manifest = INPUT / "kineva_local" / (job_id + "_cast.json")
    manifest.write_text('{"version":1,"characters":{},"locations":{}}', encoding="utf-8")
    graph = build_graph(template, reference.relative_to(INPUT).as_posix(), manifest,
        "Presentador habla al micr?fono sentado en el estudio de podcast. Primer plano de su rostro durante toda la frase.",
        job_id, 1, 1, "", dialogue="Bienvenidos a este episodio sobre las novedades de inteligencia artificial.")
    export = one(graph, "KinevaMasterExport")[0]
    director = one(graph, "MinimaxStoryDirector")[1]["inputs"]
    resolution = one(graph, "ResolutionSelector")[1]["inputs"]
    assert resolution["megapixels"] == .75
    assert director["steps"] == 18
    assert director["refine_sigmas"] == "0.9035, 0.6316, 0.3158, 0.0000"
    assert "minimax_h3" in director["upscale_model"]
    (evidence / "submitted_graph.json").write_text(json.dumps(graph, indent=2), encoding="utf-8")
    provenance = {
        "started_at": datetime.datetime.now().isoformat(),
        "template_path": str(TEMPLATE_PATH),
        "template_sha256": hashlib.sha256(TEMPLATE_PATH.read_bytes()).hexdigest(),
        "master_sha256_before": master_before, "reference": str(reference),
        "reference_sha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
        "builder": "local_creator.build_graph", "megapixels": .75, "steps": 18,
        "refine_sigmas": director["refine_sigmas"], "upscale_model": director["upscale_model"],
        "comfy_url": COMFY.base, "test_scope": "Studio graph -> ComfyUI -> Master Export; not a browser submission",
    }
    created = COMFY.call("POST", "/prompt", {"prompt": graph, "client_id": "kineva-quality-verification"})
    if not created.get("prompt_id"):
        raise RuntimeError(json.dumps(created))
    provenance["prompt_id"] = created["prompt_id"]
    (evidence / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    print("SUBMITTED", created["prompt_id"], "EVIDENCE", str(evidence), flush=True)
    video = wait_for_render(COMFY, created["prompt_id"], export, interval=5, timeout=7200)
    output = OUTPUT / video.get("subfolder", "") / video["filename"]
    report = find_manifest(OUTPUT, "kineva_local_" + job_id, video["filename"])
    validate_video_report(report)
    result = inspect(output)
    destination = Path.home() / "Documents/Kineva-Workflows/RESULTADOS_VERIFICADOS" / ("KINEVA_ESTUDIO_075MP_18PASOS_" + stamp + ".mp4")
    destination.parent.mkdir(exist_ok=True)
    shutil.copy2(output, destination)
    result.update(prompt_id=created["prompt_id"], delivered_file=str(destination),
                  output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                  master_sha256_after=hashlib.sha256(master.read_bytes()).hexdigest())
    assert result["master_sha256_after"] == master_before
    history = COMFY.call("GET", "/history/" + created["prompt_id"])
    (evidence / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    (evidence / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (evidence / "metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("COMPLETE", json.dumps(result), flush=True)

if __name__ == "__main__":
    main()
