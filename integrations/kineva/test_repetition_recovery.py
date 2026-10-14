import copy
import json
import unittest
from unittest.mock import patch
import adult_chat_worker as worker

class RepetitionRecoveryTests(unittest.TestCase):
    def test_repeated_draft_changes_retry_context_without_erasing_saved_facts(self):
        old="Puedes confiar en mí. Guardaré tu secreto y nadie sabrá nada."
        job={"language":"es","story":{"character_role":"Clara, 32 años","player_role":"Alex, 34 años"},
             "history":[{"role":"user","content":"La fiesta sorpresa de Mara es el jueves."},
                        {"role":"assistant","content":old}],
             "userMessage":"No repitas esa frase. Confirma con otras palabras que guardarás la sorpresa."}
        unchanged=copy.deepcopy(job)
        replies=[json.dumps({"gesto":"Asiento.","dialogo":old}),
                 json.dumps({"gesto":"Sonrío.","dialogo":"Mi boca está cerrada. La sorpresa del jueves queda entre nosotros."})]
        with patch.object(worker,"free_gpu_for_chat"),patch.object(worker,"model_chat",side_effect=replies) as model:
            reply=worker.reply_for(job)
        self.assertIn("jueves",reply)
        self.assertEqual(model.call_count,2)
        first,second=model.call_args_list
        self.assertGreater(second.args[1],first.args[1])
        self.assertEqual(len(second.args[0]),2)
        self.assertIn("La fiesta sorpresa de Mara es el jueves.",second.args[0][-1]["content"])
        self.assertIn(job["userMessage"],second.args[0][-1]["content"])
        self.assertEqual(job,unchanged)

    def test_retry_budget_preserves_the_complete_latest_turn_and_system_facts(self):
        messages=[{"role":"system","content":"Hecho confirmado: la reserva es 742."},
                  *[{"role":"assistant","content":"Una respuesta anterior. "*100} for _ in range(12)],
                  {"role":"user","content":"Pregunta nueva. "*100+"Final imprescindible."}]
        result=worker.repetition_retry_messages(messages,limit=4000)
        self.assertLessEqual(sum(len(m["content"]) for m in result),4000)
        self.assertIn("742",result[0]["content"])
        self.assertTrue(result[-1]["content"].endswith("Final imprescindible."))

if __name__=="__main__":
    unittest.main()
