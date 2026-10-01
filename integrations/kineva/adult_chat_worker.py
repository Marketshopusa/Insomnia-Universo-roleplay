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

def reply_for(job):
    from difflib import SequenceMatcher
    story = job.get("story") or {}
    spanish = job.get("language") == "es"
    character = str(story.get("character_role") or "personaje presente")[:160]
    player = str(story.get("player_role") or "protagonista")[:160]
    latest = str(job["userMessage"])[:1500]
    premise = str(story.get("description") or "")[:500]
    raw = (job.get("history") or [])[-40:]
    user_turns = []
    assistant_turns = []
    duplicate_latest = False
    for turn in raw:
        content = str(turn.get("content") or "").strip()[:650]
        if not content:
            continue
        normalized = normalize_reply(content)
        if turn.get("role") == "user":
            if SequenceMatcher(None, normalized, normalize_reply(latest)).ratio() >= 0.88:
                duplicate_latest = True
                continue
            if any(SequenceMatcher(None, normalized, normalize_reply(old)).ratio() >= 0.88
                   for old in user_turns[-5:]):
                continue
            user_turns.append(content)
        elif turn.get("role") == "assistant":
            assistant_turns.append(content)
    repetitive_context = duplicate_latest or any(
        SequenceMatcher(None, normalize_reply(a), normalize_reply(b)).ratio() >= 0.78
        for a, b in zip(assistant_turns[-5:-1], assistant_turns[-4:])
    )
    recent_assistant = assistant_turns[-1] if assistant_turns else ""
    recent_valid = bool(recent_assistant.startswith("*")) and not repeated_reply(
        recent_assistant, [{"role": "assistant", "content": old} for old in assistant_turns[-6:-1]])
    if len(latest) < 150 and recent_valid and not duplicate_latest:
        focus = (
            "Interpreta a " + character + " hablando directamente con " + player + ". " +
            "Tu ultima respuesta fue: " + recent_assistant[:450] +
            ". Ahora " + player + " dijo: " + latest +
            ". Responde a ESTE mensaje, sin repetir la reaccion anterior. Si hay pregunta, " +
            "contesta lo que pregunta en la primera frase del dialogo. No inventes hechos. " +
            "Devuelve SOLO JSON con 'gesto' (breve, en primera persona) y 'dialogo' " +
            "(una o dos frases en primera persona, hablando directamente a " + player + ")." +
            slang_clause(job)
        )
        try:
            fast = parse_role_reply(model_chat(
                [{"role": "system", "content": focus},
                 {"role": "user", "content": latest}], 0.55, 190, json_mode=True))
            if not repeated_reply(fast, raw[-12:]):
                print("Chat follow-up timing", job.get("jobId", "local"), flush=True)
                return fast
        except (ValueError, TypeError, AttributeError):
            pass
    # Ground the reply in the user's actual turn in one model pass. A separate
    # fact-extraction request doubled latency and sometimes distorted actors.
    started = time.monotonic()
    facts = {"mensaje_actual": latest[:1200]}
    if user_turns and len(latest) < 150:
        facts["mensaje_anterior"] = user_turns[-1][:300]
    premise_clause = ("Premisa inicial: " + premise + ". " if len(raw) < 2 else "")
    instruction = (
        "Interpreta SOLO a " + character + " en un chat de rol adulto con " + player + ". " +
        premise_clause +
        "Los hechos recientes tienen prioridad absoluta sobre la premisa inicial. " +
        "No vuelvas a un evento anterior si ya hay uno nuevo. " +
        "Mensaje actual literal: " + json.dumps(facts, ensure_ascii=False) +
        ". Determina quien hizo cada accion y a quien pertenece cada objeto ANTES de responder. " +
        "Lo que hizo " + player + " no lo hiciste tu. Reacciona al hecho actual " +
        "sin retroceder ni repetir las frases anteriores. " +
        "Conserva las relaciones y el tono de la escena; evita sermones genericos. " +
        "No inventes confesiones, sentimientos ni acciones previas que el historial no confirme. " +
        "Si te preguntan algo, responde claramente en la primera frase; si no sabes, dilo. " +
        "Si una foto o un objeto no tiene contenido descrito, no inventes su aspecto ni su significado. " +
        "No afirmes reconocer un lugar, objeto o simbolo sin que el historial lo confirme. " +
        "En 'dialogo' habla DIRECTAMENTE a " + player + " usando 'tu', nunca te refieras " +
        "a el como si fuera una tercera persona. No decidas acciones de " + player +
        ". Devuelve SOLO JSON con 'gesto' y 'dialogo'. " +
        "'gesto': accion propia en primera persona, maximo 80 caracteres. " +
        "'dialogo': lo que le dices directamente a " + player +
        ", una o dos frases, maximo 260 caracteres. " +
        ("Gesto y dialogo SOLO en espanol, sin palabras inglesas." if spanish else "Everything in English.") +
        slang_clause(job)
    )
    messages = [{"role": "system", "content": instruction}]
    previous = ("\n".join("Antes " + player + " dijo: " + old[:300]
                           for old in user_turns[-1:]) if len(latest) < 150 else "")
    if (not repetitive_context or (not duplicate_latest and recent_valid)) and recent_assistant and previous:
        messages.extend([{"role": "user", "content": previous},
                         {"role": "assistant", "content": assistant_turns[-1][:300]},
                         {"role": "user", "content": latest + "\n\nResponde ahora como " + character + " en primera persona."}])
    else:
        messages.append({"role": "user", "content":
            (previous + "\n\n" if previous else "") + "Mensaje actual de " + player + ": " +
            latest + "\n\nResponde ahora como " + character + " en primera persona."})
    for attempt in range(2):
        raw_reply = model_chat(messages, 0.65 + attempt * 0.1, 220, json_mode=True)
        try:
            content = parse_role_reply(raw_reply)
        except (ValueError, TypeError, AttributeError):
            content = ""
        invalid = (not content or len(content) > 520 or
                   normalize_reply(content) == normalize_reply(latest) or
                   repeated_reply(content, raw[-12:]))
        if not invalid:
            print("Chat generation timing", job.get("jobId", "local"),
                  "total", round(time.monotonic() - started, 2),
                  "retry", attempt, flush=True)
            return content
        messages = [messages[0], messages[-1]]
        messages[0] = {"role": "system", "content":
            instruction + " La primera respuesta reciclo una escena vieja. Cambia la reaccion " +
            "sin alterar los actores ni los hechos actuales."}
    raise RuntimeError("Local response repeated an earlier turn after grounding")

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
