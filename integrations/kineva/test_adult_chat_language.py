import unittest

from adult_chat_worker import english_drift


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


if __name__ == "__main__":
    unittest.main()
