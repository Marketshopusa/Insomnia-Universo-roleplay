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

    def test_storyboard_keeps_distinct_shots_in_each_episode(self):
        ideas = ["Andrea entrega el libro en la biblioteca."]
        shots = creator.chapter_shots({"shot_plans": [[
            {"visual": "Andrea sostiene el libro rojo.", "dialogue": ""},
            {"visual": "Luis toma el libro desde la mesa.", "dialogue": "Gracias, Andrea."},
        ]]}, ideas)
        self.assertEqual(len(shots[0]), 2)
        self.assertNotEqual(shots[0][0]["visual"], shots[0][1]["visual"])
        with self.assertRaisesRegex(ValueError, "corresponder"):
            creator.chapter_shots({"shot_plans": []}, ideas)

    def test_a_short_idea_cannot_repeat_as_multiple_episodes(self):
        with self.assertRaisesRegex(ValueError, "capítulos distintos"):
            creator.chapter_ideas({"idea": "Ella baila", "episodes": 2})

    def test_a_chapter_that_is_too_short_is_refused(self):
        with self.assertRaises(ValueError):
            creator.chapter_ideas({"chapters": ["x"]})

    def test_more_than_twelve_chapters_are_refused_instead_of_silently_dropped(self):
        with self.assertRaisesRegex(ValueError, "hasta 12"):
            creator.chapter_ideas({
                "chapters": ["Capítulo %s sigue en el mismo lugar." % number for number in range(13)],
            })

    def test_failed_video_qc_cannot_be_published(self):
        with self.assertRaisesRegex(RuntimeError, "Toma rechazada"):
            creator.validate_video_report({"qc": {"audio_present": True,
                                                   "issues": ["Large temporal jumps detected"]}})
        creator.validate_video_report({"qc": {"audio_present": True, "issues": []}})

    def test_second_character_requires_its_own_reference(self):
        with self.assertRaisesRegex(ValueError, "referencia separada"):
            creator.cast_spec({"cast": {"primary_name": "Andrea", "secondary_name": "Luis"}})

    def test_supporting_cast_accepts_distinct_faces_and_rejects_duplicates(self):
        import base64
        portrait = base64.b64encode(b"\x89PNG\r\n\x1a\nportrait").decode("ascii")
        cast = creator.cast_spec({"cast": {"primary_name": "Andrea", "supporting": [
            {"name": "Luis", "image": portrait}, {"name": "Marta", "image": portrait},
        ]}})
        self.assertEqual([actor["name"] for actor in cast["supporting"]], ["Luis", "Marta"])
        with self.assertRaisesRegex(ValueError, "nombre único"):
            creator.cast_spec({"cast": {"primary_name": "Andrea", "supporting": [
                {"name": "andrea", "image": portrait},
            ]}})

    def test_speaker_selects_the_correct_reference_and_voice_identity(self):
        cast = {"primary_name": "Elena", "secondary_name": "Marco", "secondary_image": b"portrait",
                "supporting": [{"name": "Clara", "image": b"portrait"}]}
        refs = {"characters": {"Marco": "marco.png", "Clara": "clara.png"}, "locations": {}}
        chosen, sources = creator.select_shot_cast(
            cast, refs, "elena.png", "Elena escucha a Marco hablar.", "Marco", "Bienvenidos.")
        self.assertEqual(chosen["primary_name"], "Marco")
        self.assertEqual(chosen["secondary_name"], "Elena")
        self.assertEqual(sources[:2], ["kineva_local/marco.png", "elena.png"])
        from comfy_nodes.KinevaDirectShot.nodes import KinevaDirectShotPlan
        plan, _ = KinevaDirectShotPlan().build("Marco habla con Elena.", "Bienvenidos.",
                                               primary_character=chosen["primary_name"],
                                               secondary_character=chosen["secondary_name"])
        self.assertEqual(plan["shots"][0]["dialogue"][0]["speaker"], "Marco")
        chosen, _ = creator.select_shot_cast(cast, refs, "elena.png", "Clara presenta el libro.", "Clara", "Hola.")
        self.assertEqual(chosen["primary_name"], "Clara")
        self.assertFalse(chosen["secondary_name"])
        with self.assertRaisesRegex(RuntimeError, "más de dos"):
            creator.select_shot_cast(cast, refs, "elena.png", "Elena, Marco y Clara conversan.", "", "")

    def test_two_separate_cast_references_reach_the_video_plan(self):
        import json
        template = json.loads(creator.TEMPLATE_PATH.read_text(encoding="utf-8"))
        cast = {"primary_name": "Andrea", "secondary_name": "Luis",
                "location_name": "Estación", "location_description": "Andén nocturno",
                "location_image": b"location"}
        graph = creator.build_graph(template, "andrea.png", "cast.json", "Se encuentran en el andén.",
                                    "test-job", 1, 1, "", cast)
        inputs = creator.one(graph, "KinevaDirectShotPlan")[1]["inputs"]
        self.assertEqual(inputs["primary_character"], "Andrea")
        self.assertEqual(inputs["secondary_character"], "Luis")
        self.assertEqual(inputs["location_name"], "Estación")
        self.assertFalse(creator.one(graph, "KinevaStoryCastFromManifest")[1]["inputs"]["use_reference_as_location"])
        from comfy_nodes.KinevaDirectShot.nodes import KinevaDirectShotPlan
        plan, _ = KinevaDirectShotPlan().build("Se encuentran en el andén.", primary_character="Andrea",
                                               secondary_character="Luis", location_name="Estación",
                                               location_description="Andén nocturno")
        self.assertEqual([c["name"] for c in plan["cast"]["characters"]], ["Andrea", "Luis"])
        self.assertEqual(plan["shots"][0]["characters"], ["Andrea", "Luis"])

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
        self.assertEqual(creator.one(graph, "KinevaVoiceRouter")[1]["inputs"]["mode"], "NONE")
        spoken = creator.build_graph(template, "reference.png", "cast.json", "Ella saluda a cámara.",
                                     "test-job", 1, 1, "", dialogue="Hola, te esperaba aquí.")
        self.assertEqual(creator.one(spoken, "KinevaPlanLock")[1]["inputs"]["exact_dialogue"],
                         "Hola, te esperaba aquí.")
        self.assertEqual(creator.one(spoken, "KinevaVoiceRouter")[1]["inputs"]["mode"], "H3_DESIGNED")
