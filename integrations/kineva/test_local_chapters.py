"""Studio video jobs film the written chapters, one after another."""
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent


def load_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


creator = load_file("kineva_local_creator", HERE / "local_creator.py")


class LocalChaptersTest(unittest.TestCase):
    def test_a_novel_is_one_clip_per_written_chapter(self):
        ideas = creator.chapter_ideas({
            "chapters": ["Llueve en París y él la cubre.", "Siguen bajo el mismo toldo."],
        })
        self.assertEqual(ideas, ["Llueve en París y él la cubre.", "Siguen bajo el mismo toldo."])

    def test_a_short_idea_still_repeats_for_one_to_three_episodes(self):
        self.assertEqual(creator.chapter_ideas({"idea": "Ella baila", "episodes": 2}), ["Ella baila", "Ella baila"])

    def test_a_chapter_that_is_too_short_is_refused(self):
        with self.assertRaises(ValueError):
            creator.chapter_ideas({"chapters": ["x"]})

    def test_only_the_first_twelve_chapters_are_filmed(self):
        ideas = creator.chapter_ideas({
            "chapters": ["Capítulo %s sigue en el mismo lugar." % number for number in range(13)],
        })
        self.assertEqual(len(ideas), 12)

    def test_studio_graph_uses_the_active_direct_shot_template(self):
        import json
        template = json.loads(creator.TEMPLATE_PATH.read_text(encoding="utf-8"))
        graph = creator.build_graph(
            template, "reference.png", "cast.json", "Ella saluda a cámara.",
            "test-job", 1, 1, "")
        self.assertEqual(creator.one(graph, "KinevaDirectShotPlan")[1]["inputs"]["prompt"],
                         "Ella saluda a cámara.")
        self.assertEqual(creator.one(graph, "LoadImage")[1]["inputs"]["image"],
                         "reference.png")
        self.assertTrue(creator.one(graph, "KinevaPlanLock")[1]["inputs"]["preserve_dialogue"])
