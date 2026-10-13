import unittest
from continuity_review import review_candidate

class ContinuityReviewTest(unittest.TestCase):
    def test_valid_review_does_not_change_role_text(self):
        def model(*args, **kwargs):
            return '{"consistent":true,"issue":"","source_quote":""}'
        self.assertIsNone(review_candidate("Veo la carta.", [{"role":"user","content":"Revisa la carta."}], model))

    def test_concrete_conflict_is_returned_for_regeneration(self):
        def model(*args, **kwargs):
            return '{"consistent":false,"issue":"The box was already open.","source_quote":"Ya abrí la caja."}'
        self.assertIn("already open", review_candidate("Abro la caja.", [{"role":"user","content":"Ya abrí la caja."}], model))

    def test_broken_review_is_a_recoverable_failure_not_silent_success(self):
        def model(*args, **kwargs):
            return '{"consistent":null,"issue":"","source_quote":""}'
        with self.assertRaisesRegex(ValueError, "review unavailable"):
            review_candidate("Abro la caja.", [{"role":"user","content":"Ya abrí la caja."}], model)

    def test_role_generation_instructions_are_not_sent_as_review_evidence(self):
        def model(messages, *args, **kwargs):
            self.assertNotIn("Pretend to be the character", messages[1]["content"])
            self.assertIn("Ya abrí la caja", messages[1]["content"])
            return '{"consistent":true,"issue":"","source_quote":""}'
        review_candidate("Veo la carta.", [{"role":"system","content":"Pretend to be the character"},
            {"role":"user","content":"Ya abrí la caja."}], model)

class LocalAgeGuardTest(unittest.TestCase):
    def test_minor_never_reaches_adult_model(self):
        from unittest.mock import patch
        from adult_chat_worker import reply_for, ContentBlockedError
        with patch("adult_chat_worker.model_chat") as model:
            with self.assertRaises(ContentBlockedError):
                reply_for({"story":{"character_role":"Personaje de 17 años"},"userMessage":"Continuemos."})
            model.assert_not_called()

if __name__ == "__main__":
    unittest.main()
