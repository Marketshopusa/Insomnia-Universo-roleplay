"""The story illustration asks ComfyUI for one still of the current moment."""
import importlib.util
from pathlib import Path
import sys
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def load_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


image_worker = load_file("kineva_image_worker", HERE / "image_worker.py")


class SceneStillTest(unittest.TestCase):
    def test_the_graph_is_one_comfy_still_of_the_latest_moment(self):
        prompt = image_worker.scene_prompt({
            "focusText": "Ella cruza la calle de noche",
            "storyTitle": "Reencuentro",
            "characterRole": "Andrea",
        })
        self.assertIn("LATEST MOMENT: Ella cruza la calle de noche", prompt)
        self.assertIn("Andrea", prompt)
        graph = image_worker.graph_for({
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "prompt": prompt,
        })
        self.assertEqual(graph["4"]["inputs"]["text"], prompt)
        self.assertEqual(graph["1"]["inputs"]["unet_name"], image_worker.MODEL)
        self.assertEqual(graph["6"]["class_type"], "EmptyFlux2LatentImage")
        self.assertEqual(graph["9"]["class_type"], "SaveImage")

    def test_vram_is_released_only_when_comfy_queue_is_empty(self):
        from worker import release_idle_models

        class Comfy:
            def __init__(self, running):
                self.running = running
                self.calls = []

            def call(self, method, path, payload=None):
                self.calls.append((method, path))
                if path == "/queue":
                    return {"queue_running": self.running, "queue_pending": []}
                return None

        busy = Comfy([["another-render"]])
        release_idle_models(busy)
        self.assertEqual(busy.calls, [("GET", "/queue")])
        idle = Comfy([])
        release_idle_models(idle)
        self.assertEqual(idle.calls, [("GET", "/queue"), ("POST", "/free")])

    def test_a_short_moment_is_refused_before_comfy(self):
        with self.assertRaises(ValueError):
            image_worker.scene_prompt({"focusText": "hola"})

    def test_a_missing_comfy_connection_is_reported_in_spanish(self):
        class Down:
            def call(self, method, path):
                raise OSError("refused")

        with self.assertRaisesRegex(RuntimeError, "127.0.0.1:8188"):
            image_worker.preflight(Down())


if __name__ == "__main__":
    unittest.main()
