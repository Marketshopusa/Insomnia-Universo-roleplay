import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from adult_chat_worker import english_drift, reply_for


class LanguageDriftTests(unittest.TestCase):
    def test_mixed_english_reply_from_story(self):
        self.assertTrue(english_drift(
            "Mmm yes you're absolutely right cariño. It feels so good to be here "
            "with you under the stars and that cool breeze just adds another layer."
        ))

    def test_natural_spanish_with_names(self):
        self.assertFalse(english_drift(
            "Sí, cariño. Me quedo contigo bajo las estrellas y cierro el libro "
            "mientras escucho lo que me acabas de decir."
        ))

    def test_loanword_does_not_trigger_rejection(self):
        self.assertFalse(english_drift(
            "Dejé Netflix encendido, pero ahora quiero escuchar tu historia."
        ))

    def test_regenerates_english_draft_in_spanish(self):
        job = {"language": "es", "story": {"character_role": "Lucía", "player_role": "Daniel",
                "description": "Conversan en una biblioteca."}, "history": [], "memory": [],
               "userMessage": "¿Qué piensas del libro?"}
        drafts = [
            '{"gesto":"Sonrío.","dialogo":"Yes you are right, we are here with the book and it feels good."}',
            '{"gesto":"Sonrío.","dialogo":"Creo que este libro guarda una pista. ¿Lo abrimos juntos?"}',
        ]
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=drafts) as model:
            reply = reply_for(job)
        self.assertEqual(model.call_count, 2)
        self.assertIn("este libro guarda una pista", reply)
    def test_removes_intra_reply_repeated_phrases(self):
        job = {"language": "es", "story": {"character_role": "Andrea", "player_role": "William",
                "description": "Amigos en una cabaña."}, "history": [], "memory": [],
               "userMessage": "¿Qué hacemos ahora?"}
        draft = '{"gesto":"Te miro fijamente.","dialogo":"Esto es tan loco e inapropiado. Dios mío, ¿qué estamos haciendo? Deberíamos parar. Esto es tan loco e inapropiado."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", return_value=draft) as model:
            reply = reply_for(job)
        self.assertEqual(reply.count("Esto es tan loco e inapropiado"), 1)
        self.assertIn("Deberíamos parar", reply)

    def test_rejects_pure_physical_narration_without_dialogue(self):
        job = {"language": "es", "story": {"character_role": "Penelope", "player_role": "Hombre",
                "description": "Amigos en un balcón."}, "history": [], "memory": [],
               "userMessage": "Estoy que te agarro ahora mismo."}
        drafts = [
            '{"gesto":"","dialogo":"Mis manos se deslizan hacia abajo para sostener fuertemente tus caderas mientras me presiono contra ti"}',
            '{"gesto":"Mis manos se deslizan hacia tus caderas","dialogo":"Hazlo de una vez, no me hagas esperar más..."}',
        ]
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=drafts) as model:
            reply = reply_for(job)
        self.assertEqual(model.call_count, 2)
        self.assertIn("Hazlo de una vez", reply)
        self.assertIn("*Mis manos se deslizan hacia tus caderas*", reply)

    def test_rejects_premature_sexual_actions_on_phase_1(self):
        job = {
            "language": "es",
            "story": {"character_role": "Estefani", "player_role": "Willian", "description": "Compañeros de apartamento."},
            "history": [],
            "memory": [],
            "userMessage": "Hola Estefani, ¿cómo estás?",
        }
        drafts = [
            '{"gesto":"Me desnudo ante ti y gimo","dialogo":"Quiero que me metas tu verga ahora mismo"}',
            '{"gesto":"Te saludo con una sonrisa","dialogo":"Hola Willian, bien por dicha, apenas llegando del trabajo. ¿Qué tal estuvo tu día?"}',
        ]
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=drafts) as model:
            reply = reply_for(job)
        self.assertEqual(model.call_count, 2)
        self.assertIn("Hola Willian, bien por dicha", reply)
        self.assertNotIn("verga", reply)


if __name__ == "__main__":
    unittest.main()

