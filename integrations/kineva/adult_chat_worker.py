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

def model_chat(messages, temperature, max_tokens, json_mode=False):
    payload = {"model": "magnum-v4-12b", "messages": messages, "max_tokens": max_tokens,
               "temperature": temperature, "repeat_penalty": 1.08,
               "presence_penalty": 0.1, "frequency_penalty": 0.1,
               "chat_template_kwargs": {"enable_thinking": False}}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    request = Request(os.environ.get("KINEVA_CHAT_MODEL_URL", "http://127.0.0.1:8788/v1/chat/completions"),
                      data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=90) as response:
        result = json.loads(response.read())
    content = str(result["choices"][0]["message"].get("content") or "").strip()
    return re.sub(r"(?s)<think>.*?</think>", "", content).strip()

def parse_role_reply(raw_reply):
    parsed = json.loads(raw_reply)
    gesture = str(parsed.get("gesto") or "").strip().strip("*")
    dialogue = str(parsed.get("dialogo") or "").strip()
    if len(gesture) > 100:
        cuts = [m.end() for m in re.finditer(r"[,.;](?=\s|$)", gesture[:100])
                if m.end() >= 35]
        gesture = (gesture[:cuts[0]].rstrip(" ,.;") if cuts else
                   gesture[:100].rsplit(" ", 1)[0])
    if len(dialogue) > 420:
        boundaries = [match.end() for match in re.finditer(
            r"[.!?](?=\s|$)", dialogue[:420]) if match.end() >= 90]
        if boundaries:
            dialogue = dialogue[:boundaries[-1]].strip()
    if not gesture or not dialogue or len(gesture) > 100 or len(dialogue) > 420:
        raise ValueError("Incomplete or overlong gesture/dialogue")
    return "*" + gesture + "* " + dialogue

REGION_SLANG = {
    "ar": "Escribe con jerga de Argentina: vos, tenés, che y dale.",
    "ve": "Escribe con jerga de Venezuela: chamo y vale.",
    "co": "Escribe con jerga de Colombia: parce, bacano y qué más.",
    "mx": "Escribe con jerga de México: órale, ahorita y chido.",
    "es": "Escribe con jerga de España: vale, tío y mola.",
    "cl": "Escribe con jerga de Chile: po, cachai y al tiro.",
}

def slang_clause(job):
    # Let the character and story determine diction; forced country slang became a caricature.
    return ""

def clip_text(text, limit):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return (cut or text[:limit]).rstrip(" ,.;") + "…"

def clean_turns(raw, latest):
    """Drop only an exact echo of the message being answered. Keep the scene."""
    latest_norm = normalize_reply(latest)
    turns = []
    for turn in raw or []:
        content = str(turn.get("content") or "").strip()
        if not content:
            continue
        role = "assistant" if turn.get("role") == "assistant" else "user"
        if role == "user" and normalize_reply(content) == latest_norm:
            continue
        if turns and turns[-1]["role"] == role and turns[-1]["content"] == content:
            continue
        turns.append({"role": role, "content": content})
    return turns[-48:]

def memory_transcript(turns, player, character):
    """Retain the original facts and the last completed beats in chronological order."""
    recent = turns[-10:]
    older = turns[:-10]
    if not older:
        return "", recent

    def line(turn, limit):
        who = character if turn["role"] == "assistant" else player
        return who + ": " + clip_text(turn["content"], limit)

    opening = [line(turn, 130) for turn in older[:2]]
    middle = [line(turn, 125) for turn in older[-8:] if turn not in older[:2]]
    chronicle = "Hechos del comienzo (pasado, no lugar actual): " + " | ".join(opening)
    if middle:
        chronicle += "\nDespués sucedió: " + " | ".join(middle)
    return chronicle, recent


def conversation_messages(job):
    """Give Magnum stable identity, closed history and real speaker turns."""
    story = job.get("story") or {}
    spanish = job.get("language") == "es"
    character = clip_text(story.get("character_role") or "personaje presente", 400)
    player = clip_text(story.get("player_role") or "protagonista", 220)
    latest = clip_text(job.get("userMessage") or "", 1000)
    premise = clip_text(story.get("description") or "", 700)
    turns = clean_turns((job.get("history") or [])[-48:], latest)
    chronicle, recent = memory_transcript(turns, player, character)
    # Magnum's chat template requires the first turn after system to be USER.
    # A saved session can begin with the character's introduction; preserve it as scene context.
    opening = ""
    if recent and recent[0]["role"] == "assistant":
        opening = "Última intervención previa de " + character + ": " + clip_text(recent[0]["content"], 350) + "\n"
        recent = recent[1:]
    instruction = (
        "Eres " + character + " en una historia interactiva con " + player + ". "
        "Identidad y relaciones persistentes: " + premise + ". "
        + (chronicle + "\n" if chronicle else "")
        + opening
        + "Los turnos recientes son la escena ACTUAL en orden; el último mensaje del jugador tiene prioridad. "
        "Continúa desde la última acción, con el mismo lugar, personas y objetos salvo que el jugador haya cambiado la escena. "
        "Los hechos de la premisa y del comienzo son antecedentes, no acciones que debas repetir. "
        "No cambies quién dijo, envió, sintió o hizo algo. No inventes sentimientos del jugador. "
        "IDENTIDAD: debes hablar y actuar exclusivamente como " + character + ". El jugador es " + player + ". "
        "Cuando USER dice 'yo' habla de " + player + "; cuando USER dice 'tú', 'te' o 'estás' se dirige a " + character + ". "
        "Cuando ASSISTANT dice 'yo', habla de " + character + "; cuando ASSISTANT dice 'tú' se dirige a " + player + ". "
        "No describas una acción del jugador como si fuera tuya ni llames al personaje por su propio nombre como si fuera el jugador. "
        "Si el jugador admite su error o pide perdón, eres quien recibe esa disculpa; no asumas su culpa. "
        "Tu emoción debe responder a lo que acaba de suceder y evolucionar cuando cambian los hechos. "
        "Habla al jugador en primera persona; no pases a tercera persona para referirte a ti. "
        "Escribe SOLO JSON con 'gesto' y 'dialogo'. "
        "'gesto': narración breve de tu acción, postura o sensación presente, sin órdenes de producción. "
        "'dialogo': lo que dices en voz alta al jugador, de una a tres frases; responde directamente al mensaje actual. "
        "Si ocurre una reacción audible tuya (grito, llanto, risa, gemido), descríbela en 'gesto' justo antes del diálogo que la acompaña. "
        "No enumeres sonidos, no expliques reglas internas, no reescribas el turno anterior. "
        + ("Solo español." if spanish else "English only.")
        + slang_clause(job)
    )
    messages = [{"role": "system", "content": instruction}]
    for turn in recent:
        content = clip_text(turn["content"], 350)
        if messages[-1]["role"] == turn["role"]:
            messages[-1]["content"] += "\n" + content
        else:
            messages.append({"role": turn["role"], "content": content})
    if messages[-1]["role"] == "user":
        messages[-1]["content"] += "\n" + latest
    else:
        messages.append({"role": "user", "content": latest})
    return trim_messages(messages)


def trim_messages(messages, limit=6500):
    """Keep the prompt inside the 4096-token local model, or llama refuses the turn."""
    while sum(len(item["content"]) for item in messages) > limit and len(messages) > 3:
        del messages[1:3]
    total = sum(len(item["content"]) for item in messages)
    if total > limit:
        messages[-1]["content"] = clip_text(messages[-1]["content"], max(180, len(messages[-1]["content"]) - (total - limit)))
    return messages

def exact_copy(content, previous):
    current = normalize_reply(content)
    prior = normalize_reply(previous)
    return bool(current and prior and current == prior)

def gesture_of(text):
    match = re.search(r"\*([^*]{1,120})\*", text or "")
    return normalize_reply(match.group(1) if match else "")

def too_similar(content, previous):
    """Reject copied replies, but allow the character to keep the same posture."""
    from difflib import SequenceMatcher
    current, prior = normalize_reply(content), normalize_reply(previous)
    return bool(current and prior and (
        current == prior or (len(current) >= 50 and SequenceMatcher(None, current, prior).ratio() >= 0.82)
    ))

def reply_for(job):
    started = time.monotonic()
    raw = (job.get("history") or [])[-48:]
    latest = str(job.get("userMessage") or "")
    previous = next((str(turn.get("content") or "") for turn in reversed(raw)
                     if turn.get("role") == "assistant"), "")
    messages = conversation_messages(job)
    parsed = ""
    for attempt in range(2):
        try:
            raw_reply = model_chat(messages, 0.4 + attempt * 0.05, 320, json_mode=True)
            parsed = parse_role_reply(raw_reply)
        except Exception as error:
            print("Chat attempt failed", job.get("jobId", "local"), attempt, repr(error)[:180], flush=True)
            parsed = ""
        if parsed and not too_similar(parsed, previous) and normalize_reply(parsed) != normalize_reply(latest):
            print("Chat generation timing", job.get("jobId", "local"),
                  "total", round(time.monotonic() - started, 2),
                  "retry", attempt, flush=True)
            return parsed
        messages[0]["content"] += (
            " La respuesta anterior repitió un hecho o una frase; avanza desde el último mensaje sin cambiar actores."
        )
    raise RuntimeError("Local response repeated the previous turn")

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
                time.sleep(1)
        except Exception as error:
            print("Chat worker error", repr(error)[:350], file=sys.stderr, flush=True)
            time.sleep(8)

if __name__ == "__main__":
    main()
