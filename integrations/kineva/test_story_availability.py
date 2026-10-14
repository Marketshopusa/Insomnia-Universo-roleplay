import unittest
from unittest.mock import patch
import adult_chat_worker as worker

class StoryAvailabilityTests(unittest.TestCase):
    def test_verified_possession_survives_unusable_model_drafts(self):
        job = {"language": "es", "story": {"character_role": "Clara, 32 años", "player_role": "Alex, 34 años"},
               "userMessage": "¿Quién tiene la brújula ahora?",
               "facts": [{"kind": "holder", "object": "la brújula violeta", "value": "user",
                          "source": "Ahora la sostengo en mi mano."}]}
        with patch.object(worker, "free_gpu_for_chat"), patch.object(worker, "model_chat", side_effect=ValueError("bad draft")):
            self.assertEqual(worker.reply_for(job), "Tú tienes la brújula violeta en la mano.")

    def test_ambiguous_possession_has_no_factual_fallback(self):
        facts = [{"kind": "holder", "object": name, "value": "user"} for name in ["la llave", "la brújula"]]
        self.assertIsNone(worker.grounded_fact_reply({"language": "es", "userMessage": "¿Quién lo tiene?", "facts": facts}))

    def test_guard_still_precedes_factual_fallback(self):
        job = {"language": "es", "containsMinor": True, "userMessage": "¿Quién tiene la brújula?",
               "facts": [{"kind": "holder", "object": "la brújula", "value": "user"}]}
        with self.assertRaises(worker.ContentBlockedError):
            worker.reply_for(job)

if __name__ == "__main__":
    unittest.main()
