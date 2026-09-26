"""Checks that a planner paraphrase never replaces an Insomnia shot script."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeIO:
    ComfyNode = object
    Custom = staticmethod(lambda _name: object())
    NodeOutput = staticmethod(lambda *values: values)


api = types.ModuleType("comfy_api")
latest = types.ModuleType("comfy_api.latest")
latest.ComfyExtension = object
latest.io = FakeIO
sys.modules.setdefault("comfy_api", api)
sys.modules.setdefault("comfy_api.latest", latest)

lock = load_file("kineva_plan_lock", HERE / "comfy_nodes/KinevaPlanLock/nodes.py")
worker = load_file("kineva_worker", HERE / "worker.py")


class DialogueContractTest(unittest.TestCase):
    def setUp(self):
        self.plan = {
            "cast": {"characters": [{"name": "Elena", "seen": True}]},
            "shots": [{"dialogue": [{"line": "A paraphrase from the planner.",
                                     "language": "English"}],
                       "characters": []}],
            "scenes": [{"text": "A paraphrase from the planner."}],
        }

    def test_exact_script_replaces_paraphrase_and_is_verified(self):
        words = "The door opens. I remember every word that you said."
        plan, _, _ = lock.KinevaPlanLock.execute(
            self.plan, profile="MINISERIES", exact_dialogue=words,
            dialogue_language="English", project_id="insomnia_series001")
        self.assertEqual(plan["shots"][0]["dialogue"][0]["line"], words)
        self.assertEqual(plan["_project_id"], "insomnia_series001")
        self.assertEqual(self.plan["shots"][0]["dialogue"][0]["line"],
                         "A paraphrase from the planner.")
        worker.verify_locked_dialogue({"locked_plan": plan}, words)
        plan["shots"][0]["dialogue"][0]["line"] = "A shorter imitation."
        with self.assertRaisesRegex(RuntimeError, "altered"):
            worker.verify_locked_dialogue({"locked_plan": plan}, words)

    def test_presenter_exact_dialogue_wins_over_scene_description(self):
        words = "Hola. Hoy empieza nuestra historia."
        plan, report, _ = lock.KinevaPlanLock.execute(
            self.plan, profile="TALKING_PRESENTER",
            exact_dialogue=words, dialogue_language="Spanish")
        self.assertEqual(plan["shots"][0]["dialogue"][0]["line"], words)
        self.assertEqual(plan["shots"][0]["dialogue"][0]["language"], "Spanish")
        self.assertNotIn("paraphrase", plan["shots"][0]["dialogue"][0]["line"])
        self.assertIn("exact spoken dialogue", report)
        worker.verify_locked_dialogue({"locked_plan": plan}, words)
        with self.assertRaisesRegex(ValueError, "requires exact_dialogue"):
            lock.KinevaPlanLock.execute(
                self.plan, profile="TALKING_PRESENTER", exact_dialogue="")

    def test_worker_uses_presenter_camera_and_single_take_controls(self):
        kinds = ("MinimaxStoryPlanner", "LoadImage", "KinevaStoryCastFromManifest",
                 "KinevaPlanLock", "KinevaStaticBackgroundLock",
                 "KinevaVoiceRouter", "KinevaPromptTrace",
                 "KinevaProjectContext", "KinevaRunManifest")
        template = {str(i): {"class_type": kind, "inputs": {}}
                    for i, kind in enumerate(kinds)}
        job = {"profile": "TALKING_PRESENTER", "prompt": "One fixed shot.",
               "spoken_script": "Hola.", "bible": {"language": "Spanish"},
               "project_name": "insomnia_test", "id": "00000000-0000-4000-8000-000000000001",
               "episode_number": 1, "shot": 1, "take": 1}
        graph, _ = worker.make_prompt(template, job, "reference.png", Path("cast.json"))
        controls = worker.one(graph, "KinevaPlanLock")[1]["inputs"]
        self.assertEqual(controls["exact_dialogue"], "Hola.")
        self.assertTrue(all(controls[key] for key in
                            ("force_single_take", "presenter_visible", "lock_camera")))
        self.assertTrue(worker.one(graph, "KinevaStaticBackgroundLock")[1]["inputs"]["enabled"])
        job["profile"] = "MINISERIES"
        mini, _ = worker.make_prompt(template, job, "reference.png", Path("cast.json"))
        controls = worker.one(mini, "KinevaPlanLock")[1]["inputs"]
        self.assertFalse(any(controls[key] for key in
                             ("force_single_take", "presenter_visible", "lock_camera")))

    def test_multiple_planner_shots_fail_before_upload(self):
        self.plan["shots"] *= 2
        with self.assertRaisesRegex(ValueError, "one shot"):
            lock.KinevaPlanLock.execute(
                self.plan, profile="MINISERIES", exact_dialogue="A line.")

    def test_depth_guide_covers_the_actual_h3_frames(self):
        self.plan["shots"][0]["frames"] = 125
        (frames,) = lock.KinevaH3FrameCount.execute(self.plan)
        self.assertEqual(frames, 141)
        self.plan["shots"][0]["frames"] = 124
        self.assertEqual(lock.KinevaH3FrameCount.execute(self.plan), (124,))
        self.plan["shots"] *= 2
        with self.assertRaisesRegex(ValueError, "one locked shot"):
            lock.KinevaH3FrameCount.execute(self.plan)

    def test_project_identity_rejects_path_input(self):
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            lock.KinevaPlanLock.execute(
                self.plan, profile="MINISERIES", project_id="../outside")


class RenderLeaseTest(unittest.TestCase):
    def test_long_render_renews_lease_and_keeps_video(self):
        clock = [0]
        renewals = []

        class FakeComfy:
            calls = 0

            def call(self, method, path):
                self.calls += 1
                if self.calls < 3:
                    return {}
                return {"prompt": {
                    "status": {"status_str": "success"},
                    "outputs": {"export": {"images": [
                        {"filename": "shot.mp4", "type": "output"}
                    ]}},
                }}

        def advance(seconds):
            clock[0] += seconds

        with patch.object(worker.time, "monotonic", side_effect=lambda: clock[0]), \
             patch.object(worker.time, "sleep", side_effect=advance):
            video = worker.wait_for_render(
                FakeComfy(), "prompt", "export", heartbeat=lambda: renewals.append(clock[0]),
                interval=301, timeout=3600)
        self.assertEqual(video["filename"], "shot.mp4")
        self.assertEqual(renewals, [0, 301, 602, 602])

    def test_lost_lease_stops_waiting_for_render(self):
        class FakeComfy:
            def call(self, method, path):
                raise AssertionError("Should not poll after the lease is lost")

        def lost_lease():
            raise RuntimeError("lease reclaimed")

        with self.assertRaisesRegex(RuntimeError, "reclaimed"):
            worker.wait_for_render(
                FakeComfy(), "prompt", "export", heartbeat=lost_lease)


if __name__ == "__main__":
    unittest.main()
