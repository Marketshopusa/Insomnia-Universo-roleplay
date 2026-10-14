import json
import adult_chat_worker as worker
worker.free_gpu_for_chat=lambda:None
real_model=worker.model_chat
old="Puedes confiar en mí. Guardaré tu secreto y nadie sabrá nada."
count=0
def first_old_then_real(*args,**kwargs):
    global count
    count+=1
    if count==1:
        return json.dumps({"gesto":"Asiento.","dialogo":old})
    return real_model(*args,**kwargs)
worker.model_chat=first_old_then_real
job={"jobId":"qa-forced-repeat","language":"es","region":"ve","continuityReview":True,
     "story":{"character_role":"Clara, amiga de 32 años","player_role":"Alex, organizador de 34 años",
              "description":"Preparan una fiesta sorpresa para Mara, de 34 años. La fiesta es el jueves."},
     "history":[{"role":"user","content":"La fiesta sorpresa para Mara es el jueves."},
                {"role":"assistant","content":old}],
     "userMessage":"Confirma con palabras nuevas que guardarás el secreto de la fiesta."}
reply=worker.reply_for(job)
assert count>1 and worker.normalize_reply(old) not in worker.normalize_reply(reply)
print(json.dumps({"forced_repeated_draft_recovered":True,"reply":reply,"modelCalls":count},ensure_ascii=False),flush=True)
