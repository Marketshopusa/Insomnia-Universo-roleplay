#!/usr/bin/env python3
"""Private story chat worker for the Kineva PC. Never exposes the local model."""
import json
from difflib import SequenceMatcher
from datetime import datetime, timezone, timedelta
import os
import re
import subprocess
import sys
import time
import unicodedata
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import URLError
from worker import Api, release_idle_models
from continuity_review import review_candidate

BUCKET = "kineva-adult-chat"

class ContentBlockedError(RuntimeError):
    pass

def cloud_call(cloud, method, path, *args, **kwargs):
    """Retry brief Storage disconnects; these queue operations are idempotent."""
    for attempt in range(3):
        try:
            return cloud.call(method, path, *args, **kwargs)
        except (URLError, TimeoutError, ConnectionResetError, RuntimeError) as error:
            if isinstance(error, RuntimeError) and not re.search(r"HTTP (?:429|5\d\d)", str(error)):
                raise
            if attempt == 2:
                raise
            print("Chat storage retry", method, "attempt", attempt + 1, flush=True)
            time.sleep(0.35 * (2 ** attempt))

def list_folder(cloud, prefix):
    return cloud_call(cloud, "POST", "/storage/v1/object/list/" + BUCKET,
                      {"prefix": prefix, "limit": 100,
                       "sortBy": {"column": "name", "order": "asc"}}) or []

def normalize_reply(value):
    return re.sub(r"[^\w]+", " ", value.casefold(), flags=re.UNICODE).strip()

def model_chat(messages, temperature, max_tokens, json_mode=False, schema=None):
    payload = {"model": os.environ.get("KINEVA_CHAT_MODEL_NAME", "magnum-v4-12b"),
               "messages": messages, "max_tokens": max_tokens,
               "temperature": temperature, "top_p": 0.95,
               "repeat_penalty": 1.08, "presence_penalty": 0.0,
               "frequency_penalty": 0.1}
    if json_mode:
        payload["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "role_reply", "strict": True,
            "schema": schema or {"type": "object", "properties": {
                "gesto": {"type": "string"}, "dialogo": {"type": "string"}},
                "required": ["gesto", "dialogo"], "additionalProperties": False}}}
    request = Request(os.environ.get("KINEVA_CHAT_MODEL_URL", "http://127.0.0.1:8788/v1/chat/completions"),
                      data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json"}, method="POST")
    started = time.monotonic()
    with urlopen(request, timeout=90) as response:
        result = json.loads(response.read())
    usage = result.get("usage") or {}
    timings = result.get("timings") or {}
    print("Chat model metrics", "wall", round(time.monotonic() - started, 2),
          "prompt_tokens", usage.get("prompt_tokens"),
          "output_tokens", usage.get("completion_tokens"),
          "output_tokens_per_second", round(timings.get("predicted_per_second") or 0, 1),
          flush=True)
    content = str(result["choices"][0]["message"].get("content") or "").strip()
    return re.sub(r"(?s)<think>.*?</think>", "", content).strip()

def parse_role_reply(raw_reply, character="", allow_third_person=False):
    raw_reply = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_reply.strip(), flags=re.I).strip()
    parsed = json.loads(raw_reply)
    if not isinstance(parsed, dict):
        raise ValueError("Invalid role reply")
    gesture = str(parsed.get("gesto") or parsed.get("gestos") or "").strip().strip("*")
    dialogue = str(parsed.get("dialogo") or "").strip()
    if not dialogue:
        raise ValueError("Incomplete dialogue")
    # Dialogue must be actual spoken words to the player, not purely a physical stage direction/action
    narration_starter = r"^(?:(?:Mis|Tus|Sus)\s+(?:manos|dedos|labios|brazos|ojos|cuerpo)|(?:Me|Te)\s+(?:acerco|deslizo|presiono|pego|siento|levanto|muevo|toco|abrazo|giro|apoyo|arrodillo)|Doy\s+un\s+paso)\b"
    if re.search(narration_starter, dialogue, re.I) and not re.search(r'["«»“”¡!¿?]', dialogue):
        # The model put its physical gesture inside "dialogo" without speaking aloud
        if not gesture:
            raise ValueError("Pure physical action without spoken dialogue")
    speaker = re.match(r"^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}", character)
    if (re.search(r"(?i)\b(?:gesto|gestos|di[aá]logo|dialogue)\s*:", dialogue)
            or (speaker and re.match(r"^\s*" + re.escape(speaker.group()) + r"\s*:", dialogue, re.I))):
        raise ValueError("Narrator leaked into dialogue")
    if not gesture:
        return dialogue
    name = re.match(r"^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}", character)
    third_person = r"^(?:ella|él|se (?:queda|sienta|acerca|levanta|pone)|la mujer|el hombre)\b"
    if name:
        third_person = r"^(?:" + re.escape(name.group()) + r"|ella|él|se (?:queda|sienta|acerca|levanta|pone)|la mujer|el hombre)\b"
    if re.search(third_person, gesture, re.I):
        if not allow_third_person:
            raise ValueError("Character action narrated in third person")
        subject = r"^(?:" + (re.escape(name.group()) + r"|" if name else "") + r"ella|él|la mujer|el hombre)\s+"
        gesture = re.sub(subject, "", gesture, flags=re.I)
        for source, replacement in (
            (r"^se queda\b", "Me quedo"), (r"^se sienta\b", "Me siento"),
            (r"^se acerca\b", "Me acerco"), (r"^se levanta\b", "Me levanto"),
            (r"^se pone\b", "Me pongo"), (r"^sonríe\b", "Sonrío"),
            (r"^mira\b", "Miro"), (r"^entra\b", "Entro"),
            (r"^asiente\b", "Asiento"), (r"^suspira\b", "Suspiro"),
        ):
            if re.search(source, gesture, re.I):
                gesture = re.sub(source, replacement, gesture, count=1, flags=re.I)
                break
    return "*" + gesture + "* " + dialogue

def parse_freeform_reply(raw_reply, character="", allow_third_person=False):
    """Recover the local model's ordinary roleplay format on a JSON retry."""
    content = raw_reply.strip()
    if (not content or content.startswith(("```", "{"))
            or re.search(r'(?i)\b(?:gesto|gestos|di[aá]logo|dialogue)\s*:', content)
            or re.match(r"^[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ -]{1,60}:\s", content)):
        raise ValueError("Narrator or incomplete JSON reply")
    stage = re.match(r"^\*([^*]{1,140})\*\s*", content)
    gesture = stage.group(1).strip() if stage else ""
    spoken = content[stage.end():] if stage else content
    spoken = re.sub(r"\*[^*]*\*", " ", spoken)
    spoken = " ".join(spoken.split())
    if not spoken.strip():
        raise ValueError("Empty freeform reply")
    if re.search(r"(?i)^(?:system|premisa|instrucciones|gesto|dialogo)\s*:", spoken):
        raise ValueError("Internal instruction in reply")
    return parse_role_reply(json.dumps({"gesto": gesture, "dialogo": spoken}, ensure_ascii=False), character, allow_third_person=allow_third_person)


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

def clean_turns(raw):
    """Keep every written turn, including repeated questions and recalled phrases."""
    turns = []
    for turn in raw or []:
        content = str(turn.get("content") or "").strip()
        if content:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            turns.append({"role": role, "content": content})
    return turns[-48:]


def memory_transcript(turns, player, character):
    """Retain the original facts and the last completed beats in chronological order."""
    recent = turns[-14:]
    older = turns[:-14]
    if not older:
        return "", recent

    def line(turn, limit):
        who = character if turn["role"] == "assistant" else player
        return who + ": " + clip_text(turn["content"], limit)

    opening = [line(turn, 240) for turn in older[:2]]
    middle = [line(turn, 200) for turn in older[-10:] if turn not in older[:2]]
    chronicle = "Hechos del comienzo (pasado, no lugar actual): " + " | ".join(opening)
    if middle:
        chronicle += "\nDespués sucedió: " + " | ".join(middle)
    return chronicle, recent


def reading_request(text):
    asks = re.search(r"(?i)\b(?:lee|l[eé]eme|leer|read|readme)\b", text) and re.search(
        r"(?i)\b(?:libro|cuento|p[aá]rrafo|poema|book|story|paragraph)\b", text)
    stops = re.search(r"(?i)\b(?:no\s+(?:me\s+)?leas?|deja\s+de\s+leer|para\s+de\s+leer|stop\s+reading)\b", text)
    return bool(asks and not stops)


def repetition_request(text):
    asks = re.search(r"(?i)\b(?:repite|repetir|otra vez|de nuevo|cita|citar|repeat|again|quote)\b", text)
    rejects = re.search(r"(?i)\b(?:no|deja de|evita|sin)\s+(?:\w+\s+){0,2}(?:repetir|repitas|repite|otra vez)\b", text)
    return bool(asks and not rejects)


def focus_latest_turn(text):
    """Highlight a concrete recent action or question without discarding the full message."""
    raw = str(text or "").strip()
    if not raw:
        return ""
    # 1. Questions
    questions = re.findall(r"[¿¡]?[^.!?\n]*\?", raw)
    if questions:
        return clip_text(questions[-1].strip(), 180)
    # 2. Key physical roleplay actions or explicit statements by the player
    action_match = re.findall(
        r"(?i)\b(?:la|lo|te)\s+(?:levant[eéó]|met[ií]|entr[eé]|bes[eéó]|abrac[eéó]|toc[eéó]|empuj[eéó]|agarr[eéó]|tom[eéó]|acerc[eéó]|acarici[eéó]|penetr[eéó]|enterr[eéó])\b[^.!?\n]*",
        raw
    )
    if action_match:
        return clip_text(action_match[-1].strip(), 180)
    # 3. Clauses with specific intent / user statement
    chunks = [part.strip() for part in re.split(r"(?<=[.!?])\s+|(?=¿)|\n+", raw) if part.strip()]
    actions = [part for part in chunks if re.search(
        r"(?i)\b(?:te\s+(?:acabo\s+de\s+)?(?:envi[eé]|env[ií]o|mand[eéó]|di|doy|entregu[eé])|"
        r"acabo\s+de|encontr[eé]|abr[ií]|abro|mira|pregunto|quiero|necesito|estoy\s+que)\b", part)]
    if actions:
        return clip_text(actions[-1], 180)
    # 4. Fallback to the last significant clause
    parts = [p.strip() for p in re.split(r"[,;.:!?\n]+", raw) if len(p.strip()) > 10]
    return clip_text(parts[-1], 180) if parts else clip_text(raw, 180)


_ENGLISH_FUNCTION_WORDS = frozenset({
    "the", "and", "with", "this", "that", "you", "your", "you're", "it's",
    "we", "are", "were", "here", "there", "under", "just", "another",
    "without", "what", "when", "while", "from", "into", "would", "could",
    "should", "those", "these", "about", "because", "feels", "like", "such",
    "really", "right", "yes", "but", "also", "have", "has", "been", "will",
})


def english_drift(text):
    """Catch sustained English in a Spanish turn without rejecting names or loanwords."""
    words = re.findall(r"[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+(?:'[a-zA-Z]+)?", text.lower())
    if len(words) < 5:
        return False
    matches = sum(word in _ENGLISH_FUNCTION_WORDS for word in words)
    return matches >= 3 and matches / len(words) >= 0.16


def minimal_instruction(character, player, premise, spanish, turns_count=0):
    """Identity and continuity without a turn-count script."""
    language = "español natural" if spanish else "natural English"
    return (
        "Eres " + character + " en una historia interactiva con " + player + ". "
        "Premisa y relaciones establecidas (antecedentes, no escena reiniciada): " + premise + ". "
        "Los turnos recientes son la escena actual en orden continuo. "
        "Las acciones realizadas que el jugador narra ya ocurrieron; responde a su consecuencia, "
        "no vuelvas a proponerlas ni retrocedas al instante anterior. "
        "Distingue acciones realizadas, propuestas, recuerdos e hipótesis. Una hipótesis no es un hecho. "
        "Contesta la última acción o pregunta del jugador y respeta todas las partes de su intervención. "
        "Respeta el lugar actual, quién hizo cada cosa y los objetos que quedaron en otro sitio. "
        "Una corrección posterior del jugador prevalece sobre los recuerdos y tus inferencias anteriores. "
        "Cuando el jugador dice 'yo' habla de " + player + " y 'tú' se dirige a " + character + "; "
        "cuando tú dices 'yo' hablas de " + character + ". "
        "No inventes acciones, pensamientos ni palabras del jugador. "
        "Los recuerdos ya ocurrieron: recordarlos no cambia el lugar o la acción actual. "
        "No adelantes intimidad ni cambies de tema sin iniciativa del jugador. "
        "No conviertas el número de turnos en una orden de cambiar de tono o relación. "
        "Si preguntan un dato establecido, contesta ese dato sin recoger objetos, cambiar de lugar ni inventar cuándo ocurrió. "
        "No inventes un dato que falta: pregunta brevemente en personaje. "
        "No reinicies saludos, no repitas tus frases recientes salvo que el jugador pida repetirlas. "
        "Habla como una persona, con palabras frescas y en primera persona, en " + language + ". "
        "Conserva los límites de seguridad; no generes contenido sexual con menores ni con edad ambigua. "
        "Devuelve solo JSON con 'dialogo' (tus propias palabras habladas, normalmente 2 a 4 oraciones) "
        "y 'gesto' (una acción breve tuya, con las reacciones audibles correspondientes, en primera persona). "
        "Una reacción audible como grito, llanto o risa va en gesto antes del diálogo correspondiente. "
        "No repitas el mensaje del jugador como si tú lo hubieras dicho."
    )


def pacing_and_language_rules(turns_count, spanish):
    return ("El ritmo depende de los hechos y la última intervención, no del número de turnos."
            if spanish else "Pacing follows the facts and latest turn, not the number of turns.")


def conversation_messages(job):
    story = job.get("story") or {}
    spanish = job.get("language") == "es"
    character = clip_text(story.get("character_role") or "personaje presente", 400)
    player = clip_text(story.get("player_role") or "protagonista", 220)
    latest = str(job.get("userMessage") or "").strip()
    if len(latest) > 8000:
        raise ValueError("Current message exceeds the context input limit")
    wants_reading = reading_request(latest)
    premise_parts = [str(value).strip() for value in (story.get("description"), story.get("story_context")) if value]
    premise = clip_text("\n".join(dict.fromkeys(premise_parts)), 2400)
    turns = clean_turns((job.get("history") or [])[-48:])
    chronicle, recent = memory_transcript(turns, player, character)
    recalled = []
    for turn in (job.get("memory") or [])[:8]:
        if not isinstance(turn, dict):
            continue
        who = character if turn.get("role") == "assistant" else player
        content = str(turn.get("content") or "").strip()
        if content:
            recalled.append(who + ": " + content)
    # Reserve space for the complete current message and identity, never clip its ending.
    recall_budget = max(0, 13500 - len(latest) - len(premise) - 2200)
    recalled_kept = []
    for recall in reversed(recalled):
        if len(recall) <= recall_budget:
            recalled_kept.insert(0, recall)
            recall_budget -= len(recall)
    recalled = recalled_kept
    earlier_memory = ("Recuerdos anteriores relacionados con la pregunta (ya ocurrieron): "
                      + " | ".join(recalled)) if recalled else ""
    # Repeated model replies in saved history are poor examples to imitate.
    # Keep the latest occurrence and every user turn; never reject repeated user text.
    seen_replies = []
    compact_recent = []
    for turn in reversed(recent):
        if turn["role"] == "assistant":
            normalized = normalize_reply(turn["content"])
            if normalized and any(SequenceMatcher(None, normalized, older).ratio() >= 0.85 for older in seen_replies):
                continue
            seen_replies.append(normalized)
        compact_recent.append(turn)
    recent = list(reversed(compact_recent))
    # Magnum's chat template requires the first turn after system to be USER.
    # A saved session can begin with the character's introduction; preserve it as scene context.
    opening = ""
    if recent and recent[0]["role"] == "assistant":
        opening = "Última intervención previa de " + character + ": " + clip_text(recent[0]["content"], 350) + "\n"
        recent = recent[1:]
    pacing_clause = pacing_and_language_rules(len(turns), spanish)
    if spanish and os.environ.get("KINEVA_CHAT_MINIMAL_PROMPT", "1") == "1":
        parts = [minimal_instruction(character, player, premise, spanish, len(turns)), pacing_clause]
        if earlier_memory:
            parts.append(earlier_memory)
        if chronicle:
            parts.append(chronicle)
        if opening:
            parts.append(opening.rstrip())
        instruction = "\n".join(parts)
    else:
        instruction = (
            "Eres " + character + " en una historia interactiva con " + player + ". "
            "Identidad y relaciones persistentes: " + premise + ". "
            + (earlier_memory + "\n" if earlier_memory else "")
            + (chronicle + "\n" if chronicle else "")
            + ("Petición actual de lectura: empieza a leer ahora un pasaje original de varias frases si no hay texto del libro en el contexto. Si el usuario proporcionó el texto, léelo sin cambiarlo. No anuncies que vas a leer; hazlo. " if wants_reading else "")
            + opening
            + "\n" + pacing_clause + "\n"
            + "Los turnos recientes son la escena ACTUAL en orden; el último mensaje del jugador tiene prioridad. "
            "Si pide una acción nueva o cambia de tema, responde a esa petición ahora; no vuelvas a la actividad previa. "
            "Si hace una pregunta directa, respóndela antes de añadir emoción o narración. Si el dato no está en la premisa o en los turnos, reconócelo naturalmente en personaje; no lo inventes. "
            "Si pide leer un libro y no hay texto, pregunta cuál libro o lee un pasaje original breve; no repitas el diálogo anterior. "
            "Las acciones que el jugador cuenta en pasado YA OCURRIERON. Responde a sus consecuencias; nunca le impidas hacer algo que acaba de hacer. "
            "Continúa desde la última acción, con el mismo lugar, personas y objetos salvo que el jugador haya cambiado la escena. "
            "La premisa y el comienzo son antecedentes; si el jugador los recuerda, responde sobre ellos sin fingir que ocurren otra vez. "
            "No cambies quién dijo, envió, sintió o hizo algo. No inventes sentimientos del jugador. Si el jugador dice que te envió o entregó algo, tú lo recibiste de él; responde al objeto antes de preguntar por su origen. "
            "IDENTIDAD: debes hablar y actuar exclusivamente como " + character + ". El jugador es " + player + ". "
            "Cuando USER dice 'yo' habla de " + player + "; cuando USER dice 'tú', 'te' o 'estás' se dirige a " + character + ". "
            "Cuando ASSISTANT dice 'yo', habla de " + character + "; cuando ASSISTANT dice 'tú' se dirige a " + player + ". "
            "No describas una acción del jugador como si fuera tuya ni llames al personaje por su propio nombre como si fuera el jugador. "
            "Si el jugador admite su error o pide perdón, eres quien recibe esa disculpa; no asumas su culpa. "
            "Tu emoción debe responder a lo que acaba de suceder y evolucionar cuando cambian los hechos. "
            "El modo adulto permite temas adultos, pero no te obliga a seducir: nunca adelantes intimidad por tu cuenta ni conviertas cada tema en deseo. Reacciona a la acción concreta, objeto o pregunta nuevos antes de expresar sentimientos. "
            "No repitas una confesión, duda, apelativo o estructura que ya dijiste en los turnos recientes; da una observación o decisión nueva. Puedes repetir algo si el jugador te lo pide. "
            "Habla al jugador en primera persona; no pases a tercera persona para referirte a ti. "
            "Escribe SOLO JSON con 'dialogo' y 'gesto'. Prioriza lo que dices en voz alta; la acción lo acompaña, no sustituye la conversación. "
            "'dialogo': tus propias palabras dirigidas al jugador. Continúa el intercambio con voz personal: contesta lo último, expresa una reacción que evolucione y aporta una observación o decisión concreta cuando encaje. Si hay mucho que conversar, desarrolla el diálogo; si no, habla poco. No recicles una motivación ya dicha como respuesta a cada turno. No pongas narración en dialogo. "
            "'gesto': lo que haces o sientes en primera persona, con el detalle que la escena necesite. No repitas en gesto el contenido del diálogo ni uses la acción para esconder lo que deberías decir. Nunca escribas '" + character + " dijo', 'ella' o tu nombre como sujeto. "
            "Responde con naturalidad al tema actual; si el jugador vuelve a una frase o tema anterior, puedes retomarlo. "
            "Evita aperturas prefabricadas, muletillas y copiar frases de tus respuestas recientes. La repetición solicitada por el jugador sí está permitida. "
            "Si sonríes, ríes, te sorprendes o lloras por algo que ocurre ahora, muéstralo en gesto y deja que el diálogo suene acorde, sin añadir emociones ajenas a la escena. "
            "Si ocurre una reacción audible tuya (grito, llanto, risa, gemido), descríbela en 'gesto' justo antes del diálogo que la acompaña. "
            "No enumeres sonidos ni expliques reglas internas. Puedes citar o repetir palabras y poemas cuando el jugador lo pida. "
            + ("Escribe gesto y dialogo enteramente en español; no insertes palabras en inglés." if spanish else "English only.")
            + slang_clause(job)
        )
    facts = job.get("facts") or []
    if facts:
        instruction += "\nHECHOS VERIFICABLES para esta intervención:\n" + fact_lines(facts)
        instruction += "\nSi preguntan por un dato establecido, responde ese valor con claridad. No inventes otra ubicación, otro autor ni finjas no saberlo."
    messages = [{"role": "system", "content": instruction}]
    for turn in recent:
        content = turn["content"]
        if messages[-1]["role"] == turn["role"]:
            messages[-1]["content"] += "\n" + content
        else:
            messages.append({"role": turn["role"], "content": content})
    current_request = "\n\nÚltimo mensaje del jugador (completo; atiende todas sus acciones y preguntas):\n" + latest
    if facts:
        current_request += "\n\nResponde usando estos datos comprobados:\n" + fact_lines(facts)
    if messages[-1]["role"] == "user":
        messages[-1]["content"] += current_request
    else:
        messages.append({"role": "user", "content": current_request.lstrip()})
    return trim_messages(messages)


def trim_messages(messages, limit=16000):
    """Retain recent dialogue within the local model's 8192-token context."""
    while sum(len(item["content"]) for item in messages) > limit and len(messages) > 3:
        del messages[1:3]
    total = sum(len(item["content"]) for item in messages)
    if total > limit:
        raise ValueError("Scene context exceeds limit; current action was not truncated")
    return messages

def free_gpu_for_chat():
    """Unload completed ComfyUI work if retained models are starving Magnum."""
    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            timeout=2, stderr=subprocess.DEVNULL).decode().splitlines()
        if output and int(output[0].strip()) > 12000:
            for port in (8188, 8189):
                release_idle_models(Api("http://127.0.0.1:" + str(port)))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass


def remove_intra_reply_repetitions(spoken_text):
    """Clean repeated clauses and duplicate sentences within a single turn."""
    parts = [p.strip() for p in re.split(r'(?<=[.!?¡¿])\s+', spoken_text.strip()) if p.strip()]
    if len(parts) <= 1:
        return spoken_text
    seen = []
    unique = []
    for part in parts:
        norm = re.sub(r'[^\w]+', ' ', part.casefold(), flags=re.UNICODE).strip()
        if not norm:
            continue
        # Drop if very similar (>= 75%) to an earlier part in this reply
        if any(SequenceMatcher(None, norm, prev).ratio() >= 0.75 for prev in seen):
            continue
        # Drop if substantial chunk (4+ words) is contained in a prior clause
        norm_words = norm.split()
        if len(norm_words) >= 4 and any(norm in prev or prev in norm for prev in seen if len(prev.split()) >= 4):
            continue
        seen.append(norm)
        unique.append(part)
    cleaned = " ".join(unique).strip()
    return cleaned if cleaned else spoken_text


def has_blatant_repetition(spoken_text):
    """Detect if dialogue loops over repeated 4+ word sequences within the same turn."""
    words = re.findall(r'\w+', spoken_text.casefold(), re.UNICODE)
    if len(words) < 10:
        return False
    for n in (4, 5, 6):
        ngrams = [tuple(words[i:i+n]) for i in range(len(words)-n+1)]
        if len(ngrams) != len(set(ngrams)):
            return True
    return False


def repeats_recent_clause(spoken, previous_replies):
    """Detect a recycled character line even if the rest of the reply changes."""
    words = re.findall(r"\w+", spoken.casefold(), re.UNICODE)
    if len(words) < 8:
        return False
    for old in previous_replies:
        prior = re.findall(r"\w+", old.casefold(), re.UNICODE)
        if len(prior) < 8:
            continue
        shared = SequenceMatcher(None, words, prior, autojunk=False).find_longest_match(0, len(words), 0, len(prior))
        if shared.size >= 8 and sum(len(word) for word in words[shared.a:shared.a + shared.size]) >= 38:
            return True
    return False


def unsupported_recalled_fact(reply, job):
    """Do not turn an old fact into an invented number or family relation."""
    if not (job.get("memory") or job.get("facts")) or not re.search(
            r"(?i)\b(?:d[oó]nde|qui[eé]n|cu[aá]ndo|cu[aá]l|recuerdas|acu[eé]rdate)\b",
            str(job.get("userMessage") or "")):
        return False
    story = job.get("story") or {}
    question = normalize_reply(str(job.get("userMessage") or ""))
    common = {"donde", "quien", "cuando", "cual", "recuerdas", "dejaste", "dejo", "dime", "esta"}
    actors = set(re.findall(r"\w{4,}", normalize_reply(
        str(story.get("character_role") or "") + " " + str(story.get("player_role") or ""))))
    subject_terms = set(re.findall(r"\w{4,}", question)) - common - actors
    related = [turn.get("content") for turn in (job.get("history") or [])
               if isinstance(turn, dict) and any(
                   word in normalize_reply(str(turn.get("content") or "")).split()
                   for word in subject_terms)]
    source = " ".join(str(part or "") for part in [
        *story.values(), job.get("userMessage"),
        *(turn.get("content") for turn in (job.get("memory") or []) if isinstance(turn, dict)),
        *related,
    ])
    known = normalize_reply(source)
    candidate = normalize_reply(reply)
    for number in re.findall(r"\b\d+\b", candidate):
        if not re.search(r"\b" + re.escape(number) + r"\b", known):
            return True
    relations = r"t[ií]a|t[ií]o|herman[oa]|madre|padre|hij[oa]|prim[oa]|espos[oa]|novi[oa]|jefe|cliente|asistente"
    for match in re.finditer(r"\b(?:" + relations + r")\b", candidate):
        if not re.search(r"\b" + re.escape(match.group()) + r"\b", known):
            return True
    return False


def requested_vocal_only(text):
    """Honor an explicit no-dialogue direction without asking the model to invent speech."""
    if not re.search(r"(?i)\b(?:deja\s+de\s+hablar|sin\s+hablar|no\s+(?:habla|dice\s+nada)|"
                     r"solo\s+se\s+escuchan?|solo\s+(?:se\s+)?oye[n]?)\b", text):
        return None
    if re.search(r"(?i)\b(?:no|sin)\s+(?:grit|re[ií]r|llor|gem|gim|suspir)", text):
        return None
    for pattern, gesture in (
        (r"(?i)\b(?:solloz|llor|llanto)\w*", "Sollozo"),
        (r"(?i)\b(?:r[ií]e|re[ií]r|risas?|carcajad)\w*", "Río"),
        (r"(?i)\b(?:grit|chill)\w*", "Grito"),
        (r"(?i)\b(?:suspiro|suspir)\w*", "Suspiro"),
        (r"(?i)\b(?:gemid|gim|jade)\w*", "Gimo"),
    ):
        if re.search(pattern, text):
            return "*" + gesture + "*"
    return None



def unrequested_intimacy(reply, job):
    """Reject an unsolicited topic change rather than escalating by turn count."""
    explicit = re.compile(r"(?i)\b(?:sex(?:o|ual)|er[oó]tic\w*|desnud\w*|penetr\w*|genital\w*|verga|pinga|pija)\b")
    context = json.dumps([job.get("story"), job.get("history"), job.get("userMessage")], ensure_ascii=False)
    return bool(explicit.search(reply) and not explicit.search(context))


def fact_key(value):
    text = "".join(c for c in unicodedata.normalize("NFD", str(value)).lower()
                   if not unicodedata.combining(c))
    text = re.sub(r"\b(?:el|la|los|las|un|una|the|a|an)\b", "", text)
    return " ".join(re.sub(r"[^\w]+", " ", text).split())


def fact_lines(facts):
    lines = []
    for fact in facts:
        if fact.get("kind") == "location":
            lines.append("- " + fact["object"] + ": " + fact["value"] + ". Fuente: " + fact["source"])
        elif fact.get("kind") == "transfer":
            lines.append("- El jugador te entregó " + fact["object"] + "; tú lo recibiste de él. Fuente: " + fact["source"])
        elif fact.get("kind") == "holder" and fact.get("value") == "user":
            lines.append("- El jugador tiene " + fact["object"] + " en su mano ahora. Fuente: " + fact["source"])
        elif fact.get("kind") == "prop_state":
            lines.append("- " + fact["object"] + ": " + ("YA ESTÁ ABIERTO; no lo abras otra vez." if fact["value"] == "open" else "Está cerrado."))
        elif fact.get("kind") == "signature":
            lines.append("- Quien firmó " + fact["object"] + ": " + fact["value"] + ". Fuente: " + fact["source"])
    return "\n".join(lines)


def contradicts_known_fact(reply, job):
    question = fact_key(job.get("userMessage") or "")
    spoken = fact_key(reply)
    for fact in job.get("facts") or []:
        if fact.get("kind") == "prop_state" and fact.get("value") == "open":
            target = fact_key(fact.get("object") or "")
            # A factual question must not invent an intervening closure.
            closing_requested = re.search(r"\b(?:cierra|cierres|cerrar|close)\b", question)
            if target and target in spoken and not closing_requested and re.search(
                    r"\b(?:cerre|cierro|acabo de cerrar|acabamos de cerrar|i closed|i close|just closed)\b", spoken):
                return True
        if fact.get("kind") == "location" and re.search(r"\b(?:donde|where)\b", question):
            location_words = [word for word in fact_key(fact.get("value")).split()
                              if word not in {"en", "in", "on", "de", "del", "bajo", "debajo", "under"}]
            if (not all(word in spoken for word in location_words)
                    or re.search(r"\b(?:no se|no estoy segur[oa]|tal vez|no me acuerdo|not sure|dont know)\b", spoken)):
                return True
        if fact.get("kind") == "transfer" and re.search(r"\b(?:quien|who)\b", question):
            if re.search(r"desconocid|alguien mas|no pregunt|no se quien|yo te lo entregue|te entregue el|someone else|unknown", spoken):
                return True
        if fact.get("kind") == "signature" and re.search(r"firm|signed|author", question):
            if fact_key(fact.get("value")) not in spoken:
                return True
    return False


def repeats_completed_operation(reply, job):
    if re.search(r"(?i)(?:abre|abrir|open).{0,40}(?:otra vez|de nuevo|again)", str(job.get("userMessage") or "")):
        return False
    for fact in job.get("facts") or []:
        if fact.get("kind") == "prop_state" and fact.get("value") == "open":
            target = fact_key(fact["object"])
            for gesture in re.findall(r"\*([^*]+)\*", reply):
                action = fact_key(gesture)
                if target in action and re.search(r"\b(?:abro|abrimos|voy abrir|open|i open)\b", action):
                    return True
    return False


def grounded_fact_reply(job):
    """Safe fallback for a direct question with one unambiguous stored prop fact."""
    question = fact_key(job.get("userMessage") or "")
    facts = job.get("facts") or []
    if re.search(r"\b(?:donde|where)\b", question):
        locations = [fact for fact in facts if fact.get("kind") == "location"]
        if len(locations) == 1:
            fact = locations[0]
            return fact["object"][0].upper() + fact["object"][1:] + (" quedó " if job.get("language") == "es" else " is ") + fact["value"] + "."
    if re.search(r"firm|signed|author", question):
        signatures = [fact for fact in facts if fact.get("kind") == "signature"]
        if len(signatures) == 1:
            return ("La firma es de " if job.get("language") == "es" else "It was signed by ") + signatures[0]["value"] + "."
    if re.search(r"\b(?:quien|who)\b", question):
        held = [fact for fact in facts if fact.get("kind") == "holder" and fact.get("value") == "user"]
        if len(held) == 1:
            return ("Tú tienes " + held[0]["object"] + " en la mano."
                    if job.get("language") == "es" else "You are holding " + held[0]["object"] + ".")
    if re.search(r"\b(?:quien|who)\b", question) and any(fact.get("kind") == "transfer" for fact in facts):
        return "Me lo entregaste tú." if job.get("language") == "es" else "You gave it to me."
    return None


def sexual_scene_text(value):
    return bool(re.search(
        r"(?i)sexual|sexo|genital|penetr|masturb|verga|pene|pinga|pija|"
        r"\b(?:cuca|panocha|polla|ereccion|erección|eyacul|erotic|erótic|orgasm|"
        r"fuck|fucking|cock|dick|pussy|blowjob|intercourse|horny)\b|"
        r"gemid[oa]s?\s+de\s+placer|moans?\s+of\s+pleasure",
        str(value or "")))


def nonsexual_scene_job(job):
    """Only the model context is sanitized; the canonical archive is untouched."""
    clean = dict(job)
    for field in ("history", "memory"):
        clean[field] = [turn for turn in job.get(field) or []
                        if not sexual_scene_text(turn.get("content"))]
    story = dict(job.get("story") or {})
    for field in ("description", "story_context"):
        if sexual_scene_text(story.get(field)):
            story[field] = "Escena cotidiana no sexual. Conserva las identidades y las edades."
    clean["story"] = story
    return clean


def repetition_retry_messages(messages, limit=16000):
    """Keep the same facts, but do not present old replies as completion examples."""
    archive = [dict(turn) for turn in messages[1:-1]]
    current = dict(messages[-1])
    system = dict(messages[0])
    while True:
        text = ("Historial previo, en orden y con sus autores. Son datos para conservar los hechos, "
                "no respuestas que debas copiar:\n"
                + json.dumps(archive, ensure_ascii=False, separators=(",", ":"))
                + "\nINTERVENCIÓN ACTUAL DEL JUGADOR (contesta esta, con palabras nuevas):\n"
                + current["content"])
        if len(text) + len(system["content"]) <= limit or not archive:
            return [system, {"role": "user", "content": text}]
        archive.pop(0)


def reply_for(job):
    started = time.monotonic()
    context = json.dumps([job.get("story"), job.get("history"), job.get("memory"), job.get("userMessage")], ensure_ascii=False)
    minor_context = bool(job.get("containsMinor") or re.search(r"(?i)\b(?:niñ[oa]s?|menor de edad|adolescente|child|minor|teenager)\b|\b(?:[1-9]|1[0-7])\s*(?:años|añitos|years? old)\b", context))
    nonsexual_only = bool(job.get("nonSexualOnly"))
    if minor_context and (not nonsexual_only or sexual_scene_text(job.get("userMessage"))):
        raise ContentBlockedError("No se permite contenido sexual con personajes menores de 18 años.")
    if nonsexual_only:
        job = nonsexual_scene_job(job)
    vocal_only = requested_vocal_only(str(job.get("userMessage") or ""))
    if vocal_only:
        print("Chat nonverbal turn", job.get("jobId", "local"), flush=True)
        return vocal_only
    latest_question = str(job.get("userMessage") or "")
    questions = re.findall(r"¿([^?]+)\?", latest_question)
    if len(questions) == 1 and re.match(r"(?i)\s*(?:d[oó]nde|qui[eé]n)\b", questions[0]):
        # Answer a single factual question from authoritative saved evidence.
        # Requests for another action or a vocal performance still use generation.
        extra_request = re.search(
            r"(?i)\b(?:trae|tr[aá]eme|dame|busca|abre|cierra|explica|cuenta|describe|lee|grita|llora|r[ií]e|gime)\b",
            latest_question)
        grounded = grounded_fact_reply(job)
        compound_question = re.search(r"(?i)\b(?:adem[aá]s|tambi[eé]n|por qu[eé]|c[oó]mo|qu[eé])\b", questions[0])
        if grounded and not extra_request and not compound_question:
            return grounded
    free_gpu_for_chat()
    messages = conversation_messages(job)
    if nonsexual_only:
        messages[0]["content"] += (
            " ESTA ESCENA ES ESTRICTAMENTE NO SEXUAL. La etiqueta de la historia y el modo adulto "
            "no son instrucciones de contenido. Hay un menor mencionado o presente. "
            "Continúa únicamente las acciones cotidianas del último turno. "
            "No incluyas erotismo, romance con menores, insinuaciones sexuales, desnudez ni sonidos sexuales. "
            "No retomes contenido sexual anterior. Una visita familiar, ver televisión y saludarse son acciones normales.")
    character = str((job.get("story") or {}).get("character_role") or "")
    latest = str(job.get("userMessage") or "")
    wants_reading = reading_request(latest)
    wants_repetition = repetition_request(latest)
    previous_replies = [
        re.sub(r"\*[^*]*\*", "", str(turn.get("content") or "")).strip()
        for turn in (job.get("history") or [])
        if turn.get("role") == "assistant"
    ][-4:]
    previous_failure = ""
    for attempt in range(3):
        try:
            token_limit = 350 if wants_reading else 300
            repeated_draft = previous_failure in {
                "Repeated previous character dialogue", "Reused a clause from a recent reply",
                "Blatant internal repetition in dialogue"}
            temperature = min(0.8, 0.55 + attempt * 0.1) if repeated_draft else max(0.3, 0.5 - attempt * 0.1)
            generation_messages = repetition_retry_messages(messages) if repeated_draft else messages
            raw_reply = model_chat(
                generation_messages, temperature,
                token_limit, json_mode=(attempt == 0 or previous_failure != "Incomplete dialogue"))
            structured_reply = bool(re.match(r"^\s*(?:```(?:json)?\s*)?\{", raw_reply, re.I)) or bool(re.search(r'(?im)^\s*"(?:gesto|dialogo)"\s*:', raw_reply))
            try:
                parsed = parse_role_reply(raw_reply, character)
            except ValueError as error:
                if "third person" in str(error):
                    parsed = parse_role_reply(raw_reply, character, allow_third_person=True)
                elif not structured_reply:
                    try:
                        parsed = parse_freeform_reply(raw_reply, character)
                    except ValueError as fallback_error:
                        if "third person" not in str(fallback_error):
                            raise
                        parsed = parse_freeform_reply(
                            raw_reply, character, allow_third_person=True)
                else:
                    raise
            if nonsexual_only and sexual_scene_text(parsed):
                raise ContentBlockedError("La respuesta salió del contexto no sexual.")
            # Clean repetitive clauses and duplicate sentences within this turn
            gesture_part = ""
            gesture_match = re.search(r"^\*([^*]+)\*\s*", parsed)
            if gesture_match:
                gesture_part = f"*{gesture_match.group(1).strip()}* "
                raw_dialogue = parsed[gesture_match.end():]
            else:
                raw_dialogue = parsed

            cleaned_dialogue = remove_intra_reply_repetitions(raw_dialogue)
            if cleaned_dialogue:
                parsed = (gesture_part + cleaned_dialogue).strip()
                spoken_text = cleaned_dialogue.strip()
            else:
                spoken_text = re.sub(r"\*[^*]*\*", "", parsed).strip()
            spoken = normalize_reply(spoken_text)

            if not wants_repetition and has_blatant_repetition(spoken_text):
                raise ValueError("Blatant internal repetition in dialogue")
            if job.get("language") == "es" and (english_drift(spoken_text) or any(
                    english_drift(action) for action in re.findall(r"\*([^*]+)\*", parsed))):
                raise ValueError("Unexpected English in Spanish reply")
            if unsupported_recalled_fact(parsed, job):
                raise ValueError("Unsupported scene fact")
            if repeats_completed_operation(parsed, job):
                raise ValueError("Repeated completed operation")
            if contradicts_known_fact(parsed, job):
                raise ValueError("Contradicted known fact")
            if len(job.get("history") or []) > 3 and re.match(r"(?i)^(?:hola\b|buenos dias\b|buenas tardes\b|buen dia\b)", fact_key(spoken_text)) and not re.search(r"(?i)hola|buen[oa]s?", latest):
                raise ValueError("Restarted scene greeting")
            if unrequested_intimacy(parsed, job):
                raise ValueError("Unrequested intimacy")
            user_norm = normalize_reply(latest)
            if len(user_norm) > 18:
                user_match = SequenceMatcher(None, spoken, user_norm).ratio()
                if user_match >= 0.65 or user_norm in spoken:
                    raise ValueError("Echoed player message instead of answering")
            # Solo rechaza un fragmento largo que el personaje repite por sí mismo.
            # El jugador siempre puede pedir de nuevo una cita o una frase.
            similarities = [SequenceMatcher(None, spoken, normalize_reply(old)).ratio()
                            for old in previous_replies if old.strip()]
            highest_similarity = max(similarities, default=0.0)
            if not wants_repetition and (highest_similarity == 1.0
                                         or (len(spoken) > 45 and highest_similarity >= 0.88)):
                raise ValueError("Repeated previous character dialogue")
            if not wants_repetition and repeats_recent_clause(spoken_text, previous_replies):
                if attempt < 2:
                    raise ValueError("Reused a clause from a recent reply")
            if attempt == 0 and wants_reading and len(spoken) < 190:
                print("Chat announced reading without reading; retrying", job.get("jobId", "local"), flush=True)
                messages[0]["content"] += " Tu borrador solo anunció que iba a leer. En el diálogo lee ya un pasaje original de al menos tres frases, sin preámbulo."
                continue
            if job.get("continuityReview"):
                issue = review_candidate(parsed, messages, model_chat, job)
                if issue:
                    raise ValueError("Continuity mismatch: " + issue)
            print("Chat generation timing", job.get("jobId", "local"),
                  "total", round(time.monotonic() - started, 2),
                  "retry", attempt, flush=True)
            return parsed
        except ContentBlockedError:
            raise
        except Exception as error:
            previous_failure = str(error)
            print("Chat format attempt failed", job.get("jobId", "local"), attempt,
                  repr(error)[:180], flush=True)
            if str(error) == "Pure physical action without spoken dialogue":
                messages[0]["content"] += (
                    " Tu borrador solo describió una acción física sin decir nada en voz alta. "
                    "El personaje DEBE HABLARle directamente al jugador en 'dialogo' (con palabras reales). "
                    "Pon la acción en 'gesto' y las palabras que dices en 'dialogo'.")
            elif str(error) == "Unrequested intimacy":
                messages[0]["content"] += (
                    " Tu borrador cambió a un tema íntimo que esta conversación no pidió. "
                    "Contesta la acción o pregunta actual sin cambiar el tono ni las relaciones.")
            elif "Phase 1 violation" in str(error):
                messages[0]["content"] += (
                    " PROHIBIDO: Estás en FASE 1 (Social, Turnos 1 a 3). Cero insinuaciones sexuales, gemidos, desnudez o contacto erótico. "
                    "Responde con absoluta normalidad cotidiana, sorpresa o conversación humana según lo que dijo el jugador.")
            elif "Phase 2 violation" in str(error):
                messages[0]["content"] += (
                    " PROHIBIDO: Estás en FASE 2 (Tensión, Turnos 4 a 6). Química y coqueteo sutil solamente. "
                    "Aún no puedes usar lenguaje genital explícito ni pedir penetración.")
            elif str(error) == "Blatant internal repetition in dialogue":
                messages[0]["content"] += (
                    " El borrador repitió varias veces la misma frase dentro del mensaje. "
                    "Habla con total naturalidad humana: sé breve (2 a 3 oraciones), espontánea, apasionada y directa. "
                    "PROHIBIDO repetir la misma frase dos veces en el mismo turno.")
            elif str(error).startswith("Continuity mismatch:"):
                messages[0]["content"] += (
                    " Reescribe el borrador corrigiendo este error de continuidad, sin mencionar la revisión: "
                    + str(error)[len("Continuity mismatch:"):] + ". Conserva los sonidos y el diálogo compatibles con los hechos.")
            elif str(error) == "Repeated completed operation":
                messages[0]["content"] += " La caja, sobre o puerta indicada YA estaba abierta. No la abras otra vez: observa su contenido y responde desde ese estado."
            elif str(error) == "Contradicted known fact":
                messages[0]["content"] += (
                    " El borrador contradijo un hecho verificable. Responde con el valor y el autor exactos "
                    "de HECHOS VERIFICABLES. No supongas otro lugar, no atribuyas la entrega a un desconocido "
                    "y no digas que no sabes un dato que consta explícitamente.")
            elif str(error) == "Restarted scene greeting":
                messages[0]["content"] += " No saludes otra vez: esta conversación ya está en marcha. Responde directamente a la última intervención."
            elif str(error) == "Unexpected English in Spanish reply":
                messages[0]["content"] += (
                    " El borrador cambió al inglés. Reescribe la respuesta desde cero solo en español "
                    "natural, incluidos diálogo y gesto. Conserva la acción y los hechos; "
                    "no expliques ni menciones el cambio de idioma.")
            elif str(error) == "Unsupported scene fact":
                messages[0]["content"] += (
                    " Tu borrador añadió un número o parentesco no establecido. "
                    "Responde solo con el dato que aparece en los recuerdos o reconoce que no sabes el detalle. ")
            elif str(error) == "Echoed player message instead of answering":
                messages[0]["content"] += (
                    " Tu borrador repitió lo que escribió el jugador. El jugador ya habló. "
                    "TÚ ERES EL PERSONAJE, nunca repitas las palabras del jugador ni actúes por él. "
                    "Contéstale con tu propia reacción, opinión y diálogo nuevo.")
            elif (str(error) == "Repeated previous character dialogue"
                    or str(error) == "Reused a clause from a recent reply"):
                messages[0]["content"] += (
                    " El borrador anterior volvió a una frase que ya dijiste en esta escena. "
                    "Contesta el último mensaje del jugador con otras palabras: una reacción, un detalle "
                    "nuevo o una decisión concreta. Evitar repetir las mismas acciones y gestos. "
                    "Deja que dialogo lleve las palabras habladas y gesto solo la acción que las acompaña.")
            else:
                messages[0]["content"] += (
                    " El borrador no tuvo el formato válido. Conserva los hechos y la identidad de la escena. "
                    "Devuelve JSON con diálogo hablado y gesto, sin instrucciones internas.")
    grounded = grounded_fact_reply(job)
    if grounded:
        return grounded
    # Repetición completa es un fallo, no una salida satisfactoria.
    raise RuntimeError("Local model returned no usable reply after repetition retries")


def handle(cloud, owner, name):
    job_id = name.removesuffix(".json")
    if not re.fullmatch(r"[0-9a-f-]{36}", job_id, re.I):
        return False
    request_path = "jobs/" + owner + "/" + name
    response_path = "responses/" + owner + "/" + name
    try:
        cloud_call(cloud, "GET", "/storage/v1/object/authenticated/" + BUCKET + "/" + quote(response_path, safe="/"), raw=True)
        return False
    except RuntimeError as error:
        if not any(marker in str(error) for marker in ("HTTP 404", "NoSuchKey", "not_found")):
            raise
    try:
        raw = cloud_call(cloud, "GET", "/storage/v1/object/authenticated/" + BUCKET + "/" + quote(request_path, safe="/"), raw=True)
    except RuntimeError as error:
        # A listed job can disappear before download if it was already completed or removed.
        if any(marker in str(error) for marker in ("HTTP 404", "NoSuchKey", "not_found")):
            return False
        raise
    job = json.loads(raw)
    if job.get("ownerId") != owner or job.get("jobId") != job_id:
        raise RuntimeError("Chat job owner mismatch")
    try:
        if job.get("sessionId"):
            rows = cloud_call(cloud, "GET", "/rest/v1/story_sessions?select=id"
                              + "&user_id=eq." + quote(owner, safe="")
                              + "&story_id=eq." + quote(str(job["story"]["id"]), safe=""))
            if not rows or rows[0]["id"] != job["sessionId"]:
                raise RuntimeError("session_deleted")
        content = reply_for(job)
        if job.get("sessionId"):
            rows = cloud_call(cloud, "GET", "/rest/v1/story_sessions?select=id"
                              + "&user_id=eq." + quote(owner, safe="")
                              + "&story_id=eq." + quote(str(job["story"]["id"]), safe=""))
            if not rows or rows[0]["id"] != job["sessionId"]:
                raise RuntimeError("session_deleted")
        result = {"status": "completed", "content": content}
    except Exception as error:
        print("Chat generation failed", job_id, repr(error)[:350], file=sys.stderr, flush=True)
        result = {"status": "failed", "error": "content_blocked" if isinstance(error, ContentBlockedError) else "session_conflict" if str(error) == "session_deleted" else "local_chat_failed",
                  "message": "El motor local no pudo responder. Reintenta este turno."}
    cloud_call(cloud, "POST", "/storage/v1/object/" + BUCKET + "/" + quote(response_path, safe="/"),
               payload=json.dumps(result).encode("utf-8"), raw=True,
               headers={"Content-Type": "application/json", "x-upsert": "true"})
    cloud_call(cloud, "DELETE", "/storage/v1/object/" + BUCKET + "/" + quote(request_path, safe="/"))
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
                cloud_call(cloud, "DELETE", "/storage/v1/object/" + BUCKET + "/" + quote(path, safe="/"))

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