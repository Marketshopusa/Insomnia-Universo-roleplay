import unittest
import voice_language_policy as policy

class VoiceLanguageTest(unittest.TestCase):
    def request(self, language="Spanish", text="The morning train was late again.", steps=14):
        character = {"name": "Alex", "identity": "an adult", "voice": "Natural adult speaking voice."}
        plan = {"shots": [{"dialogue": [{"speaker": "Alex", "language": language, "line": "Hola."}]}]}
        return policy.prepare_voice(plan, character, text, 42, steps, "euler", "beta")

    def test_spanish_reference_and_language_are_consistent(self):
        request = self.request()
        self.assertEqual(request["language"], "Spanish")
        self.assertEqual(request["reference_text"], policy.SPANISH_REFERENCE)
        self.assertNotIn("The morning train", request["reference_text"])
        self.assertNotIn("?", request["reference_text"])
        self.assertIn("Latin American Spanish", request["character"]["voice"])

    def test_custom_spanish_reference_is_preserved(self):
        self.assertEqual(self.request(text="Hoy hablamos con calma.")["reference_text"], "Hoy hablamos con calma.")

    def test_english_request_remains_english(self):
        request = self.request(language="English")
        self.assertEqual(request["language"], "English")
        self.assertEqual(request["reference_text"], "The morning train was late again.")

    def test_language_text_and_sampling_changes_invalidate_cache(self):
        original = self.request()["cache_key"]
        self.assertNotEqual(original, self.request(language="English")["cache_key"])
        self.assertNotEqual(original, self.request(text="Una frase diferente.")["cache_key"])
        self.assertNotEqual(original, self.request(steps=18)["cache_key"])
        self.assertIn("__voice_v2_", original)

    def test_character_with_no_line_uses_spanish_default(self):
        self.assertEqual(policy.spoken_language({}, "Alex"), "Spanish")

    def test_original_character_is_not_mutated(self):
        character = {"name": "Alex", "voice": "Quiet."}
        policy.prepare_voice({}, character, "", 42, 14, "euler", "beta")
        self.assertEqual(character["voice"], "Quiet.")

if __name__ == "__main__":
    unittest.main()
