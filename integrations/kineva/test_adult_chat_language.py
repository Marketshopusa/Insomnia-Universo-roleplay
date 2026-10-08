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
        self.assertFalse(english_drift(reply))


if __name__ == "__main__":
    unittest.main()
