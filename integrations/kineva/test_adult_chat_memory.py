import unittest

from adult_chat_worker import conversation_messages, too_similar


def job(history, user_message):
    return {
        "language": "es",
        "region": "ve",
        "userMessage": user_message,
        "story": {
            "character_role": "Andrea",
            "player_role": "William",
            "description": "Andrea es la novia de Daniel y William es su amigo.",
        },
        "history": history,
    }


class StoryMemoryTest(unittest.TestCase):
    def test_long_user_line_keeps_the_scene_just_played(self):
        history = [
            {"role": "assistant", "content": "*Se sube a la camioneta* Me siento al lado de Daniel y el viaje se pone intenso."},
            {"role": "user", "content": "Andrea, Daniel y tú van juntos."},
            {"role": "assistant", "content": "*Sonrío* Ay William, no seas tan gruñón. Vámonos ya."},
        ]
        latest = (
            "Bueno si quieres coquetear con tu guapo novio ahí está Daniel y está Andrea "
            "en la cabaña, mejor nos calmamos porque anoche todavía se sentía todo."
        )
        packed = "\n".join(item["content"] for item in conversation_messages(job(history, latest)))
        self.assertIn("camioneta", packed)
        self.assertIn("Daniel", packed)
        self.assertIn("gruñón", packed)
        self.assertIn("cabaña", packed)
        self.assertNotIn("No vuelvas a un evento anterior", packed)
        plain = dict(job(history, latest))
        plain["region"] = "plain"
        quiet = "\n".join(item["content"] for item in conversation_messages(plain))
        self.assertNotIn("chamo", quiet)
        self.assertNotIn("Mantén esta misma región", quiet)

    def test_opening_fact_survives_a_long_story(self):
        history = [
            {"role": "assistant", "content": "*Llego a la cabaña del lago* Daniel dejó la llave bajo la maceta."},
            {"role": "user", "content": "Entremos antes de que oscurezca."},
        ]
        for index in range(16):
            history.append({"role": "user", "content": f"Seguimos hablando del tema {index} junto al fogón."})
            history.append({"role": "assistant", "content": f"*Atiendo el fogón* Sigo aquí contigo, turno {index}."})
        packed = "\n".join(item["content"] for item in conversation_messages(
            job(history, "¿Te acuerdas de lo que pasó al llegar, antes del fogón?")))
        self.assertIn("cabaña", packed)
        self.assertIn("maceta", packed)
        self.assertIn("fogón", packed)
        self.assertIn("mismo lugar", packed)
        self.assertIn("misma postura", packed)
        self.assertNotIn("acción física nueva", packed)
        self.assertIn("Orden fija para todo chat", packed)
        self.assertIn("no disocies", packed)
        self.assertIn("esa acción es tuya", packed)
        self.assertIn("te equivocaste al enviarlo", packed)
        self.assertNotIn("no te disculpes otra vez", packed)
        self.assertLess(len(packed), 6500)

    def test_premise_and_turn_order_survive(self):
        current = job([
            {"role": "assistant", "content": "*Señalo el porche* La llave está bajo la maceta."},
            {"role": "user", "content": "Ya estamos en la puerta."},
        ], "¿Dónde está la llave?")
        current["story"]["character_role"] = "Andrea, amiga de Daniel. " + "Recuerda el viaje. " * 12 + "Vive en Caracas."
        current["story"]["description"] = "Llegamos a la cabaña. " + "Daniel guardó la llave. " * 12 + "La carta está en la cocina."
        messages = conversation_messages(current)
        roles = [item["role"] for item in messages]
        packed = "\n".join(item["content"] for item in messages)
        self.assertIn("Vive en Caracas", packed)
        self.assertIn("La carta está en la cocina", packed)
        self.assertIn("bajo la maceta", packed)
        self.assertEqual(roles[0:2], ["system", "user"])
        self.assertTrue(all(left != right for left, right in zip(roles[1:], roles[2:])))

    def test_a_copied_apology_is_rejected(self):
        previous = (
            "*Se cubre el rostro con las manos, angustiada.* Willian, por favor, no me digas eso. "
            "Tú no entiendes lo mucho que me arrepiento. No debí enviar nunca esa grabación."
        )
        copied = (
            "*Se cubre el rostro con las manos, angustiada.* Willian, por favor, no me digas eso. "
            "Tú no entiendes lo mucho que me arrepiento. No debí enviar nunca esa grabación..."
        )
        fresh = "*Bajo las manos y te miro* Si Daniel no se entera, entonces dejemos de hablar de eso."
        self.assertTrue(too_similar(copied, previous))
        self.assertFalse(too_similar(fresh, previous))


if __name__ == "__main__":
    unittest.main()
