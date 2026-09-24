"""Checks that a planner paraphrase never replaces an Insomnia shot script."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest

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

    def test_multiple_planner_shots_fail_before_upload(self):
        self.plan["shots"] *= 2
        with self.assertRaisesRegex(ValueError, "one shot"):
            lock.KinevaPlanLock.execute(
                self.plan, profile="MINISERIES", exact_dialogue="A line.")

    def test_project_identity_rejects_path_input(self):
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            lock.KinevaPlanLock.execute(
                self.plan, profile="MINISERIES", project_id="../outside")


if __name__ == "__main__":
    unittest.main()
