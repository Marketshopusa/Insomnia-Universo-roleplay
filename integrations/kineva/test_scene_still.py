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
        self.assertIn("CHARACTER visible reaction: Ella cruza la calle de noche", prompt)
        self.assertIn("Andrea", prompt)
        graph = image_worker.graph_for({
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "prompt": prompt,
        })
        self.assertEqual(graph["4"]["inputs"]["text"], prompt)
        self.assertEqual(graph["1"]["inputs"]["unet_name"], image_worker.MODEL)
        self.assertEqual(graph["6"]["class_type"], "EmptyFlux2LatentImage")
        self.assertEqual(graph["9"]["class_type"], "SaveImage")
        with_reference = image_worker.graph_for({
            "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "prompt": prompt,
            "reference_name": "character.png",
        })
        self.assertEqual(with_reference["10"]["inputs"]["image"], "character.png")
        self.assertEqual(with_reference["7"]["inputs"]["positive"], ["12", 0])
        self.assertEqual(with_reference["7"]["inputs"]["negative"], ["13", 0])
        directed = image_worker.scene_prompt({
            "focusText": "*Miro el libro* Ya encontré la página.",
            "userAction": "*Abro la puerta de la biblioteca y entrego el libro*",
        })
        self.assertIn("PLAYER visible action: Abro la puerta de la biblioteca", directed)
        self.assertIn("CHARACTER visible reaction: Miro el libro", directed)

    def test_long_player_action_keeps_its_last_visible_beat(self):
        action = "Camino por el pasillo y miro los cuadros. " * 10 + "Entrego la brújula a Andrea."
        prompt = image_worker.scene_prompt({
            "focusText": "*Andrea toma la brújula*",
            "userAction": "*" + action + "*",
            "characterRole": "Andrea",
            "playerRole": "William",
        })
        self.assertIn("Entrego la brújula a Andrea", prompt)
        self.assertNotIn("Crop before", prompt)

    def test_vehicle_scene_replaces_old_bedroom_context(self):
        prompt = image_worker.scene_prompt({
            "focusText": "*Mira al usuario y sonríe*",
            "userAction": "*Subimos al vehículo y nos sentamos en el asiento trasero*",
            "sceneText": "Antes estaban en una habitación con cama.",
        })
        self.assertIn("Current setting cues only: inside a vehicle", prompt)
        self.assertNotIn("Antes estaban", prompt)
        self.assertNotIn("one coherent room", prompt)

    def test_recent_action_survives_dialogue_only_turn(self):
        prompt = image_worker.scene_prompt({
            "focusText": "*Responde con calma* Entendido.",
            "userAction": "¿Me escuchas?",
            "recentVisualAction": "*Entro en el vehículo y cierro la puerta*",
        })
        self.assertIn("PLAYER visible action: Entro en el vehículo", prompt)
        self.assertIn("Current setting cues only: inside a vehicle", prompt)

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
