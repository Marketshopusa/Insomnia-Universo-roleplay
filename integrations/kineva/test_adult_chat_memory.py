import unittest
from urllib.error import URLError
from unittest.mock import patch

from adult_chat_worker import cloud_call, conversation_messages, focus_latest_turn, handle, parse_role_reply, reply_for, requested_vocal_only


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
    def test_explicit_silent_vocal_turn_does_not_make_up_dialogue(self):
        self.assertEqual(requested_vocal_only("Deja de hablar; solo se escucha mi llanto."), "*Sollozo*")
        self.assertEqual(requested_vocal_only("Sin hablar, solo se oye tu risa."), "*Río*")
        self.assertIsNone(requested_vocal_only("Cuéntame qué pasó cuando lloraste."))
        with patch("adult_chat_worker.model_chat") as model:
            response = reply_for(job([], "Deja de hablar. Solo se escucha tu risa."))
        self.assertEqual(response, "*Río*")
        model.assert_not_called()


    def test_new_action_gets_priority_without_removing_the_rest_of_the_turn(self):
        latest = ("Hablamos del mapa y de la estación. Te envié una brújula antigua. "
                  "La ventana del vídeo se parece a la biblioteca.")
        self.assertEqual(focus_latest_turn(latest), "Te envié una brújula antigua.")
        messages = conversation_messages(job([], latest))
        self.assertIn(latest, messages[-1]["content"])
        self.assertIn("Detalle nuevo que debes atender: Te envié una brújula antigua.", messages[-1]["content"])
        self.assertIn("no te obliga a seducir", messages[0]["content"])


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
        self.assertLess(len(packed), 16000)

    def test_recent_story_detail_survives_without_short_turn_clipping(self):
        detail = "Salimos a buscar la llave. " * 17 + "La carta violeta quedó bajo la maceta."
        current = job([{"role": "user", "content": detail}], "¿Dónde quedó la carta violeta?")
        packed = "\n".join(item["content"] for item in conversation_messages(current))
        self.assertIn("La carta violeta quedó bajo la maceta", packed)

    def test_long_dialogue_is_delivered_without_cutting_its_last_point(self):
        spoken = "Hablemos con calma de lo que pasó. " * 28 + "Mañana llevaré la carta a Clara."
        reply = parse_role_reply('{"gesto":"Respiro hondo","dialogo":"' + spoken + '"}', "Andrea")
        self.assertIn("Mañana llevaré la carta a Clara.", reply)

    def test_long_action_narration_is_not_cut_at_one_hundred_characters(self):
        action = "Me detengo junto a la puerta, observo el sobre que dejaste en la mesa y noto que tiene una marca de agua en el borde."
        reply = parse_role_reply('{"gesto":"' + action + '","dialogo":"Ahora entiendo por qué te preocupaba."}', "Andrea")
        self.assertIn(action, reply)

    def test_duplicate_description_and_context_are_not_repeated(self):
        current = job([], "¿Qué pasó con la carta?")
        current["story"]["story_context"] = current["story"]["description"]
        system = conversation_messages(current)[0]["content"]
        self.assertEqual(system.count("Andrea es la novia de Daniel"), 1)

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
        self.assertIn(current["userMessage"], messages[1]["content"])
        self.assertIn("Detalle nuevo que debes atender:", messages[1]["content"])

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
        self.assertEqual(model.call_args.args[2], 500)

    def test_repeated_user_question_and_poem_remain_in_history(self):
        poem = "Pedrito se cayó, volvió a levantarse y siguió cantando."
        history = [
            {"role": "user", "content": poem},
            {"role": "assistant", "content": "*Sonrío* Me gusta ese verso."},
            {"role": "user", "content": "¿Recuerdas cuando dije que Pedrito se cayó?"},
            {"role": "assistant", "content": "*Asiento* Sí, lo recuerdo."},
            {"role": "user", "content": poem},
        ]
        messages = conversation_messages(job(history, poem))
        packed = "\n".join(item["content"] for item in messages)
        self.assertEqual(packed.count(poem), 3)
        self.assertIn("¿Recuerdas cuando dije que Pedrito se cayó?", packed)
        self.assertIn("Sí, lo recuerdo", packed)

    def test_character_may_repeat_quoted_poem_when_asked(self):
        poem = "Pedrito se cayó, volvió a levantarse y siguió cantando."
        prior = "*Sonrío* " + poem
        current = job([
            {"role": "user", "content": "Ese es el poema."},
            {"role": "assistant", "content": prior},
        ], "Me gustó el poema; léelo otra vez.")
        raw = '{"gesto":"Sonrío","dialogo":"' + poem + '"}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", return_value=raw) as model:
            reply = reply_for(current)
        self.assertEqual(reply, prior)
        model.assert_called_once()

    def test_repeated_intro_with_new_scene_detail_is_not_cut_or_rejected(self):
        previous = "*Bajo la mirada* Ay, no puedo creer que me hayas dejado hacer esto. Volvamos a casa."
        current = job([
            {"role": "assistant", "content": previous},
            {"role": "user", "content": "Vi algo moverse al lado de la ventana."},
        ], "¿Qué ves ahora junto a la ventana?")
        raw = '{"gesto":"Miro hacia la ventana","dialogo":"Ay, no puedo creer que me hayas dejado hacer esto. Ahora veo una sombra detrás del cristal."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", return_value=raw) as model:
            reply = reply_for(current)
        self.assertEqual(reply, "*Miro hacia la ventana* Ay, no puedo creer que me hayas dejado hacer esto. Ahora veo una sombra detrás del cristal.")
        model.assert_called_once()

    def test_empty_json_retry_uses_unconstrained_generation(self):
        current = job([{"role": "assistant", "content": "*Abro la ventana* Hay una sombra en el jardín."}],
                      "Encontré una llave bajo la maceta. ¿Abrimos la puerta?")
        fresh = '{"gesto":"Miro la llave","dialogo":"La veo en tu mano. Probemos si abre la puerta de la cabaña."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=['{"gesto":"","dialogo":""}', fresh]) as model:
            reply = reply_for(current)
        self.assertIn("Probemos si abre", reply)
        self.assertEqual(model.call_count, 2)
        self.assertFalse(model.call_args.kwargs["json_mode"])

    def test_empty_json_then_plain_roleplay_is_delivered(self):
        current = job([{"role": "assistant", "content": "*Abro la ventana* Hay una sombra en el jardín."}],
                      "Encontré una llave bajo la maceta. ¿Abrimos la puerta?")
        plain = ("*Miro la llave y sonrío*\nPodemos probarla en esta cerradura. "
                 "Si se abre, entraré contigo sin hacer ruido.\n*Me acerco a la puerta*")
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=['{"gesto":"","dialogo":""}', plain]) as model:
            reply = reply_for(current)
        self.assertEqual(reply, "*Miro la llave y sonrío* Podemos probarla en esta cerradura. Si se abre, entraré contigo sin hacer ruido.")
        self.assertEqual(model.call_count, 2)

    def test_relevant_older_memory_is_kept_as_past_with_correct_speaker(self):
        current = job([{"role": "user", "content": "Ahora estamos en la estación."}],
                      "¿Dónde dejó William la llave azul?")
        current["memory"] = [{"role": "user", "content": "William dejó la llave azul bajo la maceta."}]
        messages = conversation_messages(current)
        self.assertIn("William: William dejó la llave azul bajo la maceta.", messages[0]["content"])
        self.assertIn("ya ocurrieron", messages[0]["content"])
        self.assertIn("estación", messages[-1]["content"])

    def test_near_identical_reply_retries_without_losing_scene(self):
        current = job([{"role": "assistant", "content": "*Miro la mesa* El tren va a Sevilla."}],
                      "Ahora guardo el mapa. ¿Qué hacemos?")
        same = '{"gesto":"Asiento","dialogo":"El tren va a Sevilla."}'
        fresh = '{"gesto":"Guardo el mapa","dialogo":"Podemos buscar el andén juntos."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=[same, fresh]) as model:
            reply = reply_for(current)
        self.assertIn("buscar el andén", reply)
        self.assertEqual(model.call_count, 2)
        self.assertIn("Ahora guardo el mapa", model.call_args.args[0][-1]["content"])
        self.assertIn("dialogo lleve las palabras habladas", model.call_args.args[0][0]["content"])
        self.assertNotIn("gesto breve", model.call_args.args[0][0]["content"])

    def test_repetition_retry_exhaustion_delivers_a_valid_reply_instead_of_red_error(self):
        current = job([{"role": "assistant", "content": "*Miro el sobre* La carta está sobre la mesa."}],
                      "¿Qué hacemos ahora con la carta?")
        repeated = '{"gesto":"Miro el sobre","dialogo":"La carta está sobre la mesa."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", return_value=repeated) as model:
            reply = reply_for(current)
        self.assertEqual(reply, "*Miro el sobre* La carta está sobre la mesa.")
        self.assertEqual(model.call_count, 3)

    def test_recalled_fact_does_not_gain_an_unsupported_number(self):
        current = job([], "¿Dónde dejó William el mapa?")
        current["memory"] = [{"role": "user", "content": "William dejó el mapa en la taquilla."}]
        invented = '{"gesto":"Asiento","dialogo":"Lo dejó en la taquilla número 42."}'
        grounded = '{"gesto":"Recuerdo","dialogo":"Lo dejó en la taquilla."}'
        with patch("adult_chat_worker.free_gpu_for_chat"), patch(
                "adult_chat_worker.model_chat", side_effect=[invented, grounded]) as model:
            reply = reply_for(current)
        self.assertIn("en la taquilla", reply)
        self.assertNotIn("42", reply)
        self.assertEqual(model.call_count, 2)

    def test_storage_connection_reset_retries_without_losing_job(self):
        class FlakyCloud:
            calls = 0
            def call(self, method, path):
                self.calls += 1
                if self.calls == 1:
                    raise URLError(ConnectionResetError(10054, "temporary reset"))
                return {"status": "completed"}
        cloud = FlakyCloud()
        with patch("adult_chat_worker.time.sleep"):
            result = cloud_call(cloud, "GET", "/storage/v1/object/authenticated/test")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(cloud.calls, 2)

    def test_removed_job_does_not_stall_the_worker(self):
        class RemovedJob:
            def call(self, method, path, *args, **kwargs):
                raise RuntimeError("HTTP 400: NoSuchKey")

        self.assertFalse(handle(RemovedJob(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json"))


if __name__ == "__main__":
    unittest.main()