import unittest
from unittest.mock import patch

from adult_chat_worker import conversation_messages, parse_role_reply, repeated_opening, reply_for, too_similar


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
        self.assertIn("turnos recientes", packed)
        self.assertNotIn("acción física nueva", packed)
        self.assertIn("escena ACTUAL", packed)
        self.assertIn("último mensaje", packed)
        self.assertIn("No cambies quién", packed)
        self.assertNotIn("te equivocaste al enviarlo", packed)
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
        self.assertEqual(roles[0], "system")
        self.assertEqual(roles[-1], "user")
        self.assertTrue(all(left != right for left, right in zip(roles[1:], roles[2:])))

    def test_character_introduction_stays_in_context_with_valid_turn_order(self):
        current = job([
            {"role": "assistant", "content": "*Me aferro a la manta* La tormenta me asusta."},
        ], "¿Qué haces aquí? Preciosa, estás asustadita.")
        current["story"]["character_role"] = "Stefany"
        current["story"]["player_role"] = "Daniel"
        messages = conversation_messages(current)
        self.assertEqual([turn["role"] for turn in messages], ["system", "user"])
        self.assertIn("La tormenta me asusta", messages[0]["content"])
        self.assertIn("'estás' se dirige a Stefany", messages[0]["content"])
        self.assertEqual(messages[1]["content"], current["userMessage"])

    def test_character_narrates_her_own_action(self):
        with self.assertRaisesRegex(ValueError, "third person"):
            parse_role_reply('{"gesto":"Estefani entra corriendo a la habitación", "dialogo":"Me asusté."}', "Estefani")
        with self.assertRaisesRegex(ValueError, "third person"):
            parse_role_reply('{"gesto":"Ella se queda mirando la puerta", "dialogo":"No sé quién llegó."}', "Estefani")
        self.assertEqual(parse_role_reply(
            '{"gesto":"Me quedo mirando la puerta, sorprendida", "dialogo":"No esperaba verte."}', "Estefani"),
            "*Me quedo mirando la puerta, sorprendida* No esperaba verte.")

    def test_dialogue_survives_when_model_omits_a_gesture(self):
        self.assertEqual(parse_role_reply(
            '{"gesto":"", "dialogo":"La sombra está junto al muro."}', "Andrea"),
            "La sombra está junto al muro.")

    def test_third_person_draft_has_a_first_person_fallback(self):
        current = job([
            {"role": "assistant", "content": "*Miro la puerta* Ya encontré la llave."},
            {"role": "user", "content": "Vamos al jardín."},
        ], "¿Qué ves junto al muro?")
        raw = '{"gesto":"Ella se queda mirando el muro", "dialogo":"Veo una sombra junto a las piedras."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", return_value=raw) as model:
            reply = reply_for(current)
        self.assertEqual(reply, "*Me quedo mirando el muro* Veo una sombra junto a las piedras.")
        model.assert_called_once()
        self.assertEqual(model.call_args.args[2], 240)

    def test_recycled_dialogue_opening_is_detected_even_with_new_ending(self):
        history = [{"role": "assistant", "content": "*Bajo la mirada* Ay, no puedo creer que me hayas dejado hacer esto. Volvamos a casa."}]
        self.assertTrue(repeated_opening(
            "*Sonrío* Ay, no puedo creer que me hayas dejado hacer esto. Ahora veo la ventana.", history))
        self.assertFalse(repeated_opening(
            "*Miro hacia arriba* La ventana acaba de abrirse con el viento. ¿Lo oíste?", history))

    def test_stable_posture_can_be_reused_with_fresh_dialogue(self):
        previous = "*Me siento junto a la puerta* Estoy preocupada por el ruido."
        current = "*Me siento junto a la puerta* Ahora escucho pasos afuera."
        self.assertFalse(too_similar(current, previous))

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