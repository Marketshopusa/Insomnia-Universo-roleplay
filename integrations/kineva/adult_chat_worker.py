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
               "temperature": temperature, "chat_template_kwargs": {"enable_thinking": False}}
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
    if not gesture:
        gesture = "Respiro hondo"
    dialogue = str(parsed.get("dialogo") or "").strip()
    if len(gesture) > 100:
        cuts = [m.end() for m in re.finditer(r"[,.;](?=\s|$)", gesture[:100])
                if m.end() >= 35]
        gesture = (gesture[:cuts[0]].rstrip(" ,.;") if cuts else
                   gesture[:100].rsplit(" ", 1)[0])
    if len(dialogue) > 350:
        boundaries = [match.end() for match in re.finditer(
            r"[.!?](?=\s|$)", dialogue[:350]) if match.end() >= 90]
        if boundaries:
            dialogue = dialogue[:boundaries[-1]].strip()
    if not gesture or not dialogue or len(gesture) > 100 or len(dialogue) > 350:
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
    if job.get("language") != "es":
        return ""
    region = str(job.get("region") or "mx")
    return " " + REGION_SLANG.get(region, REGION_SLANG["mx"]) + " Mantén esta misma región en cada turno. No vuelvas al español neutro ni cambies de país."

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
    """Opening facts plus the latest beats. The local model only has 4096 tokens."""
    recent_count = min(8, len(turns))
    older, recent = turns[:-recent_count], turns[-recent_count:]
    if not older:
        return "", recent

    def line(turn, limit):
        who = character if turn["role"] == "assistant" else player
        return who + ": " + clip_text(turn["content"], limit)

    opening = [line(turn, 220) for turn in older[:4]]
    budget = 2200 - sum(len(item) + 1 for item in opening)
    tail = []
    for turn in reversed(older[4:]):
        item = line(turn, 140)
        if budget < len(item) + 1:
            break
        budget -= len(item) + 1
        tail.append(item)
    return "\n".join(opening + list(reversed(tail))), recent

def conversation_messages(job):
    """Every turn carries the story so far. A long user line must not wipe it."""
    story = job.get("story") or {}
    spanish = job.get("language") == "es"
    character = str(story.get("character_role") or "personaje presente")[:160]
    player = str(story.get("player_role") or "protagonista")[:160]
    latest = str(job.get("userMessage") or "")[:1500]
    premise = clip_text(story.get("description") or "", 360)
    turns = clean_turns((job.get("history") or [])[-48:], latest)
    chronicle, recent = memory_transcript(turns, player, character)
    memory = (
        "Memoria vigente, en orden. Esto ya ocurrió y sigue siendo cierto:\n" + chronicle
        if chronicle else
        "Conserva lugar, personas, relaciones y hechos de los turnos recientes. No empieces de cero."
    )
    instruction = (
        "Interpreta SOLO a " + character + " en un chat de rol con " + player + ". "
        "Premisa de fondo, solo si no contradice la memoria: " + premise + ". "
        + memory + " "
        "El mensaje nuevo continúa esta misma escena. No reinicies la historia, no cambies de tema "
        "y no respondas como si lo anterior no hubiera pasado. "
        "Si el mensaje está mal transcrito, interprétalo dentro de la escena en curso. "
        "Lo que hizo " + player + " no lo hiciste tú. No decidas las acciones de " + player + ". "
        "No des un sermón ni saltes a otra trama. Si preguntan algo, contesta en la primera frase. "
        "En 'dialogo' habla DIRECTAMENTE a " + player + " usando 'tú'. "
        "Devuelve SOLO JSON con 'gesto' y 'dialogo'. "
        "'gesto': acción propia en primera persona, máximo 80 caracteres. "
        "'dialogo': una o dos frases, máximo 260 caracteres. "
        + ("Gesto y diálogo SOLO en español, sin palabras inglesas." if spanish else "Everything in English.")
        + slang_clause(job)
    )
    messages = [{"role": "system", "content": instruction}]
    for turn in recent:
        who = character if turn["role"] == "assistant" else player
        messages.append({"role": turn["role"], "content": who + ": " + clip_text(turn["content"], 320)})
    closing = latest + "\n\nSigue ahora esta misma historia, como " + character + ", sin borrar lo que ya pasó."
    messages.append({"role": "user", "content": closing})
    return messages

def reply_for(job):
    started = time.monotonic()
    raw = (job.get("history") or [])[-48:]
    latest = str(job.get("userMessage") or "")
    messages = conversation_messages(job)
    instruction = messages[0]["content"]
    for attempt in range(2):
        raw_reply = model_chat(messages, 0.62 + attempt * 0.08, 220, json_mode=True)
        try:
            content = parse_role_reply(raw_reply)
        except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
            content = ""
        invalid = (not content or len(content) > 520 or
                   normalize_reply(content) == normalize_reply(latest) or
                   repeated_reply(content, raw[-12:]))
        if not invalid:
            print("Chat generation timing", job.get("jobId", "local"),
                  "total", round(time.monotonic() - started, 2),
                  "retry", attempt, flush=True)
            return content
        messages = [{"role": "system", "content": instruction +
                     " La respuesta anterior se salió de la historia. Mantén los mismos hechos, el mismo lugar y las mismas relaciones."},
                    *messages[1:]]
    raise RuntimeError("Local response left the ongoing story")

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
