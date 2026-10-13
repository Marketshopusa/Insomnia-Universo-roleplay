"""Non-sexual continuity QA against the already-running local model."""
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "integrations" / "kineva"))
import adult_chat_worker as engine

def main():
    fixtures = subprocess.check_output(["node", str(ROOT / "scripts" / "storyContinuityFixtures.mjs")])
    cases = json.loads(fixtures.decode("utf-8"))
    results = []
    # The existing model is running; QA must not unload video models or change services.
    engine.free_gpu_for_chat = lambda: None
    for case in cases:
        try:
            reply = engine.reply_for(case["job"])
            passed = bool(re.search(case["required"], reply, re.I))
            if case.get("forbidden") and re.search(case["forbidden"], reply, re.I):
                passed = False
            results.append({"name": case["name"], "passed": passed, "reply": reply,
                            "archiveTurns": len(case["history"])})
        except Exception as error:
            results.append({"name": case["name"], "passed": False, "error": str(error)})
        print(case["name"], "PASS" if results[-1]["passed"] else "FAIL", flush=True)
        print(results[-1].get("reply") or results[-1].get("error"), flush=True)
    report = {"model": "local existing Magnum", "nonSexualFixtures": True,
              "passed": sum(item["passed"] for item in results), "total": len(results), "results": results}
    target = ROOT / ".vercel" / "story-continuity-verification.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if report["passed"] == report["total"] else 1

if __name__ == "__main__":
    raise SystemExit(main())
