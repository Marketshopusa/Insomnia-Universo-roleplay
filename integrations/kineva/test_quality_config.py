"""Protect template routing and updates in a long-running Studio worker."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import worker

HERE = Path(__file__).resolve().parent

class QualityConfigurationTest(unittest.TestCase):
    def test_bundled_quality_contract(self):
        graph = worker.load_api_template(HERE / "workflows/KINEVA_MINISERIES_API_TEMPLATE.json")
        resolution = worker.one(graph, "ResolutionSelector")[1]["inputs"]
        director = worker.one(graph, "MinimaxStoryDirector")[1]["inputs"]
        self.assertEqual(resolution["megapixels"], .75)
        self.assertEqual(director["width"], [worker.one(graph, "ResolutionSelector")[0], 0])
        self.assertEqual(director["height"], [worker.one(graph, "ResolutionSelector")[0], 1])
        self.assertEqual(director["steps"], 18)
        self.assertEqual(director["refine_sigmas"], "0.9035, 0.6316, 0.3158, 0.0000")
        self.assertEqual(director["upscale_model"], "minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors")

    def test_running_worker_observes_template_change_before_next_claim(self):
        graph = worker.load_api_template(HERE / "workflows/KINEVA_MINISERIES_API_TEMPLATE.json")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "api.json"
            worker.one(graph, "ResolutionSelector")[1]["inputs"]["megapixels"] = .5
            path.write_text(json.dumps(graph))
            observed = []
            def claim(_cloud, _comfy, template, _input, _output):
                observed.append(worker.one(template, "ResolutionSelector")[1]["inputs"]["megapixels"])
                if len(observed) == 1:
                    worker.one(graph, "ResolutionSelector")[1]["inputs"]["megapixels"] = .75
                    path.write_text(json.dumps(graph))
                    return True
                raise StopIteration()
            with patch.object(worker, "validate_runtime", return_value=True), \
                 patch.object(worker, "run_once", side_effect=claim), \
                 patch.dict(os.environ, SUPABASE_URL="http://local.invalid", SUPABASE_SERVICE_ROLE_KEY="test"), \
                 patch("sys.argv", ["worker", "--workflow-api", str(path), "--input-dir", folder, "--output-dir", folder]):
                with self.assertRaises(StopIteration):
                    worker.main()
            self.assertEqual(observed, [.5, .75])

    def test_active_template_is_preferred_and_bundled_is_fallback(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(Path, "home", return_value=Path(folder)):
            self.assertEqual(worker.default_api_template(), HERE / "workflows/KINEVA_MINISERIES_API_TEMPLATE.json")
            active = Path(folder) / "Documents/Kineva-Workflows/ACTIVE/KINEVA_MINISERIES_API_TEMPLATE.json"
            active.parent.mkdir(parents=True)
            active.write_text("{}")
            self.assertEqual(worker.default_api_template(), active)

if __name__ == "__main__":
    unittest.main()
