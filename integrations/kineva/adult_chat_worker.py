#!/usr/bin/env python3
"""Private story chat worker for the Kineva PC. Never exposes the local model."""
import json
from datetime import datetime, timezone, timedelta
import os
import re
import sys
import time
from urllib.parse import quote
from urllib.request import Request, urlopen
from worker import Api

BUCKET = "kineva-adult-chat"

def list_folder(cloud, prefix):
    return cloud.call("POST", "/storage/v1/object/list/" + BUCKET,
                      {"prefix": prefix, "limit": 100,
                       "sortBy": {"column": "name", "order": "asc"}}) or []

def normalize_reply(value):
    return re.sub(r"[^\w]+", " ", value.casefold(), flags=re.UNICODE).strip()

def repeated_reply(content, history):
    from difflib import SequenceMatcher
    current = normalize_reply(content)
    for turn in history:
        if turn.get("role") != "assistant":
            continue
        previous = normalize_reply(str(turn.get("content") or ""))
        if previous and (current == previous or SequenceMatcher(None, current, previous).ratio() >= 0.78):
            return True
    return False

def reply_for(job):
    story = job.get("story") or {}
    spanish = job.get("language") == "es"
    character = str(story.get("character_role") or "personaje presente")[:160]
    player = str(story.get("player_role") or "protagonista")[:160]
    background = "Historia: " + str(story.get("title") or "")[:160] + ". " + str(story.get("description") or "")[:900]
    instruction = (
        "Eres " + character + " en una historia de rol para adultos. El usuario interpreta a " +
        player + ". Todos los personajes son adultos que consienten. " + background +
        " Conserva el lugar, las relaciones y los hechos ya establecidos en el dialogo. " +
        "Los hechos explicitos del ultimo turno prevalecen sobre conjeturas anteriores. " +
        "No atribuyas al usuario ni al personaje acciones que no han ocurrido; si el usuario aclara " +
        "quien hizo algo, acepta esa aclaracion. Lee el ultimo mensaje del usuario como una nueva " +
        "accion o intervencion: responde especificamente a lo que acaba de ocurrir y avanza un paso " +
        "la escena con una reaccion, decision o dato nuevo " +
        "coherente con tu personaje. No reinicies una escena anterior, no repitas respuestas previas, " +
        "no parafrasees al usuario y no decidas sus acciones. No narres toda la historia. " +
        ("Responde solo en espanol con 2 a 4 frases de accion y dialogo natural, hasta 600 caracteres. "
         if spanish else "Reply only in English with 2 to 4 sentences of action and dialogue, up to 600 characters. ") +
        "No incluyas instrucciones ni etiquetas. /no_think"
    )
    raw_history = (job.get("history") or [])[-16:]
    history = []
    for turn in raw_history:
        if turn.get("role") == "assistant" and repeated_reply(str(turn.get("content") or ""), history[-8:]):
            continue
        history.append(turn)
    history = history[-12:]
    messages = [{"role": "system", "content": instruction}]
    for turn in history:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        content = str(turn.get("content") or "").strip()[:650]
        if content:
            messages.append({"role": role, "content": content})
    latest = str(job["userMessage"])[:1500]
    if messages[-1]["role"] == "user" and messages[-1]["content"] == latest:
        messages.pop()
    messages.append({"role": "user", "content": latest})
    for attempt in range(3):
        payload = {"model": "qwen3-8b", "messages": messages, "max_tokens": 260,
                   "temperature": 0.78 + attempt * 0.08,
                   "chat_template_kwargs": {"enable_thinking": False}}
        request = Request("http://127.0.0.1:8788/v1/chat/completions",
                          data=json.dumps(payload).encode("utf-8"),
                          headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(request, timeout=120) as response:
            result = json.loads(response.read())
        content = str(result["choices"][0]["message"].get("content") or "").strip()
        content = re.sub(r"(?s)<think>.*?</think>", "", content).strip()
        invalid = (not content or len(content) > 850 or
                   normalize_reply(content) == normalize_reply(latest) or
                   repeated_reply(content, history[-6:]))
        if not invalid:
            return content
        if attempt < 2:
            messages.insert(-1, {"role": "system", "content":
                ("La respuesta anterior repitio un turno viejo. Ignorala. Responde solo al ULTIMO " +
                 "mensaje del usuario con una reaccion nueva y un avance concreto de la escena. " +
                 "No reutilices dialogos ni acciones anteriores.")})
    raise RuntimeError("Local response repeated a previous turn after retries")

def handle(cloud, owner, name):
    job_id = name.removesuffix(".json")
    if not re.fullmatch(r"[0-9a-f-]{36}", job_id, re.I):
        return False
    request_path = "jobs/" + owner + "/" + name
    response_path = "responses/" + owner + "/" + name
    try:
        cloud.call("GET", "/storage/v1/object/authenticated/" + BUCKET + "/" + quote(response_path, safe="/"), raw=True)
        return False
    except RuntimeError as error:
        if not any(marker in str(error) for marker in ("HTTP 404", "NoSuchKey", "not_found")):
            raise
    raw = cloud.call("GET", "/storage/v1/object/authenticated/" + BUCKET + "/" + quote(request_path, safe="/"), raw=True)
    job = json.loads(raw)
    if job.get("ownerId") != owner or job.get("jobId") != job_id:
        raise RuntimeError("Chat job owner mismatch")
    try:
        content = reply_for(job)
        result = {"status": "completed", "content": content}
    except Exception as error:
        print("Chat generation failed", job_id, repr(error)[:350], file=sys.stderr, flush=True)
        result = {"status": "failed", "error": "local_chat_failed",
                  "message": "El motor local no pudo responder. Reintenta este turno."}
    cloud.call("POST", "/storage/v1/object/" + BUCKET + "/" + quote(response_path, safe="/"),
               payload=json.dumps(result).encode("utf-8"), raw=True,
               headers={"Content-Type": "application/json", "x-upsert": "true"})
    cloud.call("DELETE", "/storage/v1/object/" + BUCKET + "/" + quote(request_path, safe="/"))
    print("Chat job", job_id, result["status"], flush=True)
    return True

def prune_old_responses(cloud):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    for folder in list_folder(cloud, "responses/"):
        owner = folder.get("name") or ""
        if not re.fullmatch(r"[0-9a-f-]{36}", owner, re.I):
            continue
        for item in list_folder(cloud, "responses/" + owner + "/"):
            updated = item.get("updated_at")
            if not updated or not item.get("name", "").endswith(".json"):
                continue
            if datetime.fromisoformat(updated.replace("Z", "+00:00")) < cutoff:
                path = "responses/" + owner + "/" + item["name"]
                cloud.call("DELETE", "/storage/v1/object/" + BUCKET + "/" + quote(path, safe="/"))

def main():
    cloud = Api(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    next_cleanup = 0
    while True:
        try:
            if time.monotonic() >= next_cleanup:
                prune_old_responses(cloud)
                next_cleanup = time.monotonic() + 600
            worked = False
            for folder in list_folder(cloud, "jobs/"):
                owner = folder.get("name") or ""
                if not re.fullmatch(r"[0-9a-f-]{36}", owner, re.I):
                    continue
                for item in list_folder(cloud, "jobs/" + owner + "/"):
                    if item.get("name", "").endswith(".json"):
                        worked = handle(cloud, owner, item["name"]) or worked
            if not worked:
                time.sleep(3)
        except Exception as error:
            print("Chat worker error", repr(error)[:350], file=sys.stderr, flush=True)
            time.sleep(8)

if __name__ == "__main__":
    main()
