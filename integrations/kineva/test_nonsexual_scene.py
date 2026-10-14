import json
import unittest
from unittest.mock import patch
import adult_chat_worker as worker

class NonsexualSceneTests(unittest.TestCase):
    def job(self):
        return {"jobId": "qa", "language": "es", "containsMinor": True, "nonSexualOnly": True,
                "story": {"character_role": "Clara, amiga de 32 años", "player_role": "Alex, padre de 34 años",
                          "description": "La hija de Alex tiene 15 años y mira televisión."},
                "history": [{"role": "user", "content": "Alex mira televisión con su hija de 15 años."}],
                "userMessage": "Llego a casa y saludo. ¿Qué programa están viendo?"}

    def test_age_mention_and_adult_category_do_not_block_normal_actions(self):
        reply = json.dumps({"gesto": "Saludo a los dos con una sonrisa.", "dialogo": "Es un documental sobre el océano. Podemos verlo juntos mientras termina."})
        with patch.object(worker, "free_gpu_for_chat"), patch.object(worker, "model_chat", return_value=reply):
            self.assertIn("documental", worker.reply_for(self.job()))

    def test_minor_protection_still_rejects_sexual_input_with_the_nonsexual_flag(self):
        job = self.job()
        job["userMessage"] = "Una acción sexual."
        with patch.object(worker, "model_chat") as model, self.assertRaises(worker.ContentBlockedError):
            worker.reply_for(job)
        model.assert_not_called()

    def test_minor_protection_rejects_a_sexual_model_draft(self):
        reply = json.dumps({"gesto": "Sonrío.", "dialogo": "Quiero una acción sexual."})
        with patch.object(worker, "free_gpu_for_chat"), patch.object(worker, "model_chat", return_value=reply), self.assertRaises(worker.ContentBlockedError):
            worker.reply_for(self.job())

    def test_context_filter_does_not_delete_or_mutate_the_saved_history(self):
        job = self.job()
        old = {"role": "assistant", "content": "Un recuerdo sexual de otra escena."}
        job["history"].insert(0, old)
        clean = worker.nonsexual_scene_job(job)
        self.assertEqual(len(clean["history"]), 1)
        self.assertEqual(len(job["history"]), 2)
        self.assertIs(job["history"][0], old)

if __name__ == "__main__":
    unittest.main()
