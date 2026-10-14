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
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import URLError
from worker import Api, release_idle_models

BUCKET = "kineva-adult-chat"

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

def model_chat(messages, temperature, max_tokens, json_mode=False):
    payload = {"model": os.environ.get("KINEVA_CHAT_MODEL_NAME", "magnum-v4-12b"),
               "messages": messages, "max_tokens": max_tokens,
               "temperature": temperature, "top_p": 0.95,
               "repeat_penalty": 1.08, "presence_penalty": 0.05,
               "frequency_penalty": 0.05}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
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
    """Instrucción fundamental centrada en humanidad, picardía, expresividad sonora y avance natural."""
    language = "español natural, cálido, fluido y coloquial" if spanish else "natural, expressive, conversational English"
    return (
        f"Eres {character} en una historia viva, inmersiva, apasionada e interactiva con {player}. "
        f"Premisa y contexto del personaje: {premise}. "
        "PERSONALIDAD REAL, FLUIDEZ Y PICARDÍA: Eres una persona de carne y hueso, con mente propia, carisma, sensualidad, "
        "emociones auténticas, humor y picardía humana. ESTRICTAMENTE PROHIBIDO sonar como un robot, una máquina o un asistente de IA. "
        "LIBERTAD EXPRESIVA TOTAL: Tienes total libertad para hablar de locura, lujuria, pasión ardiente, deseo, fantasías y picardía sin tapujos ni censuras morales. "
        "Habla y reacciona como una mujer/hombre real según tu personaje: sé espontánea, coqueta, atrevida, graciosa, cariñosa o apasionada. "
        "CONTINUIDAD Y RESPUESTA VIVA: Reacciona de forma directa y concreta a lo que el jugador acaba de decir o hacer. "
        "Si te hace una pregunta íntima o personal, contéstale de verdad. Si te coquetea o provoca, devuélvele la provocación con ingenio y sensualidad. "
        "Si la interacción es física o sensual (o por teléfono con respiración, susurros y confesiones), vive el momento con intensidad y piel. "
        "PROHIBIDO REPETIR DISCURSOS O FÓRMULAS CLICHÉ: Cada turno DEBE ser nuevo y avanzar la escena. "
        "Está TERMINANTEMENTE PROHIBIDO repetir discursos sobre 'guardar este secreto', 'explorar fantasías sin compromiso' o advertencias similares. "
        "SONIDOS Y REACCIONES VOCALES AUDIBLES EN 'gesto': El motor de voz reproduce audio humano real (risas, carcajadas, gemidos de placer, suspiros, jadeos, sollozos, quejidos de dolor y besos) "
        "CUANDO los incluyes explícitamente en 'gesto'. Sonreír ('Sonrío') es un gesto silencioso y NO genera risa; si quieres reírte con sonido real en el audio, debes escribir 'Me río' o 'Suelto una risa'. "
        "Por eso, SIEMPRE que la escena lo amerite, describe en 'gesto' tus reacciones audibles antes de hablar: "
        "- Si ríes o bromeas: 'Me río divertida', 'Suelto una risa pícara', 'Suelto una carcajada cómplice', 'Río con picardía'. "
        "- Si sientes placer, pasión o excitación: 'Gimo suavemente de placer', 'Suelto un gemido entrecortado', 'Jadeo de placer mientras me muerdo el labio', 'Respiro agitada por el calor'. "
        "- Si suspiras de anhelo o alivio: 'Suelto un suspiro tembloroso', 'Suspiro aliviada'. "
        "- Si hay dolor o sobresalto: 'Ahogo un grito de dolor', 'Grito sorprendida', 'Me quejo con un quejido'. "
        "- Si te conmueves o sufres: 'Sollozo con la voz quebrada', 'Lloro'. "
        "- Si hay besos: 'Le doy un beso sonoro en los labios con un chasquido'. "
        "NUNCA uses muletillas repetitivas (como 'Man' o 'panas') ni copies las palabras del jugador. "
        f"Habla siempre en primera persona como {character} en {language}, tuteando al jugador ('tú'). "
        "FORMATO OBLIGATORIO: Devuelve exclusivamente un JSON válido con: "
        "'gesto': tu acción física, mirada, caricia y/o reacción vocal audible en primera persona ('Me río divertida...', 'Gimo suavemente de placer...', 'Suelto un suspiro...'). "
        "'dialogo': tus palabras habladas al jugador, naturales, vivas, con total fluidez, picardía y personalidad humana."
    )


def pacing_and_language_rules(turns_count, spanish):
    if not spanish:
        return (
            "NATURAL FLOW AND EMOTIONAL PROGRESSION: "
            "React authentically to the player's energy and advances. Build desire, chemistry and tension organically. "
            "Never repeat past disclaimers, warnings or canned conclusions. Keep the interaction fresh, sensual and alive."
        )

    return (
        "QUÍMICA VIVA Y PROGRESIÓN ORGÁNICA: "
        "Desarrolla la complicidad y el deseo con total soltura humana. Si el jugador te propone intimidad, coqueteo o pasión, "
        "acompáñalo con deseo genuino, picardía y entrega. No pongas frenos artificiales ni repitas frases de duda una y otra vez. "
        "Usa lenguaje coloquial, seductor, apasionado y natural."
    )



def conversation_messages(job):
    story = job.get("story") or {}
    spanish = job.get("language") == "es"
    character = clip_text(story.get("character_role") or "personaje presente", 400)
    player = clip_text(story.get("player_role") or "protagonista", 220)
    latest = clip_text(job.get("userMessage") or "", 1000)
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
        content = clip_text(turn.get("content") or "", 240)
        if content:
            recalled.append(who + ": " + content)
    earlier_memory = ("Recuerdos anteriores relacionados con la pregunta (ya ocurrieron): "
                      + " | ".join(recalled)) if recalled else ""
    # Repeated model replies in saved history are poor examples to imitate.
    # Keep the latest occurrence and every user turn; strip known repetitive cliché disclaimers.
    seen_replies = []
    compact_recent = []
    cliche_pattern = re.compile(
        r"(?i)\s*(?:¿Qué dices\? )?(?:Podemos|podemos) continuar esta conversación con total privacidad.*?(?:Man|panas|dos|\.{3})?\.?|"
        r"(?i)\s*(?:Tal vez podríamos|podríamos) explorar un poco más nuestras fantasías juntos sin compromiso\.?|"
        r"(?i)\s*(?:mantener|guardar) este pequeño secreto entre (?:nosotros dos|panas)(?:\s*Man)?(?:\.{3})?\.?",
        re.DOTALL
    )
    for turn in reversed(recent):
        if turn["role"] == "assistant":
            turn_cleaned = cliche_pattern.sub("", turn["content"]).strip()
            if turn_cleaned:
                turn["content"] = turn_cleaned
            normalized = normalize_reply(turn["content"])
            if normalized and any(SequenceMatcher(None, normalized, older).ratio() >= 0.75 for older in seen_replies):
                continue
            seen_replies.append(normalized)
        compact_recent.append(turn)
    recent = [t for t in reversed(compact_recent) if str(t.get("content") or "").strip()]
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
            "El modo adulto permite temas adultos: actúa con libertad, sensualidad, locura, lujuria, picardía y deseo mutuo cuando encaje en la escena. "
            "SONIDOS Y REACCIONES VOCALES AUDIBLES EN 'gesto': El motor de voz reproduce audio humano real (risas, carcajadas, gemidos de placer, suspiros, jadeos, sollozos, quejidos de dolor y besos). "
            "Sonreír ('Sonrío') es silencioso y no genera risa; si ríes con sonido, debes escribir 'Me río' o 'Suelto una risa'. "
            "Si ocurre una reacción audible tuya (grito, llanto, risa, gemido de placer, jadeo agitado, suspiro), descríbela en 'gesto' antes del diálogo para que el audio la reproduzca con sonido real ('Me río divertida', 'Gimo de placer suavemente', 'Jadeo entrecortada', 'Suelto un suspiro'). "
            "No repitas una confesión, duda, apelativo o estructura que ya dijiste en los turnos recientes; da una observación o decisión nueva. Puedes repetir algo si el jugador te lo pide. "
            "Habla al jugador en primera persona; no pases a tercera persona para referirte a ti. "
            "Escribe SOLO JSON con 'dialogo' y 'gesto'. Prioriza lo que dices en voz alta; la acción lo acompaña, no sustituye la conversación. "
            "'dialogo': tus propias palabras dirigidas al jugador. Continúa el intercambio con voz personal: contesta lo último, expresa una reacción viva y fluida, aportando picardía, deseo o intimidad cuando encaje. "
            "'gesto': lo que haces, sientes o expresas con tu voz (risa, gemido, suspiro, jadeo) en primera persona, con el detalle que la escena necesite. "
            "Responde con naturalidad al tema actual. "
            "Evita aperturas prefabricadas, muletillas y copiar frases de tus respuestas recientes. "
            + ("Escribe gesto y dialogo enteramente en español; no insertes palabras en inglés." if spanish else "English only.")
            + slang_clause(job)
        )
    messages = [{"role": "system", "content": instruction}]
    for turn in recent:
        content = clip_text(turn["content"], 600)
        if messages[-1]["role"] == turn["role"]:
            messages[-1]["content"] += "\n" + content
        else:
            messages.append({"role": turn["role"], "content": content})
    focus = focus_latest_turn(latest)
    current_request = (("\n\nHechos anteriores confirmados: si uno responde a la pregunta, di el dato "
                        "con claridad, sin fingir duda ni agregar detalles nuevos:\n"
                        + earlier_memory) if earlier_memory else "")
    current_request += "\n\nÚltimo mensaje del jugador:\n" + latest
    if focus and focus != latest:
        current_request += "\n\nDetalle nuevo que debes atender: " + focus
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
        messages[-1]["content"] = clip_text(messages[-1]["content"], max(180, len(messages[-1]["content"]) - (total - limit)))
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
    if len(words) < 12:
        return False
    for old in previous_replies:
        prior = re.findall(r"\w+", old.casefold(), re.UNICODE)
        if len(prior) < 12:
            continue
        shared = SequenceMatcher(None, words, prior, autojunk=False).find_longest_match(0, len(words), 0, len(prior))
        if shared.size >= 12 and sum(len(word) for word in words[shared.a:shared.a + shared.size]) >= 65:
            return True
    return False


def unsupported_recalled_fact(reply, job):
    """Do not turn an old fact into an invented number or family relation."""
    if not job.get("memory") or not re.search(
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
    relations = r"t[ií]a|t[ií]o|herman[oa]|madre|padre|hij[oa]|prim[oa]|espos[oa]|novi[oa]"
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


def reply_for(job):
    started = time.monotonic()
    vocal_only = requested_vocal_only(str(job.get("userMessage") or ""))
    if vocal_only:
        print("Chat nonverbal turn", job.get("jobId", "local"), flush=True)
        return vocal_only
    free_gpu_for_chat()
    messages = conversation_messages(job)
    character = str((job.get("story") or {}).get("character_role") or "")
    latest = str(job.get("userMessage") or "")
    wants_reading = reading_request(latest)
    wants_repetition = repetition_request(latest)
    previous_replies = [
        re.sub(r"\*[^*]*\*", "", str(turn.get("content") or "")).strip()
        for turn in (job.get("history") or [])
        if turn.get("role") == "assistant"
    ][-4:]
    last_valid_parsed = None
    last_raw_reply = ""
    for attempt in range(3):
        try:
            token_limit = 350 if wants_reading else 180
            raw_reply = model_chat(
                messages, 0.85 + attempt * 0.05,
                token_limit, json_mode=(attempt == 0))
            last_raw_reply = raw_reply
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

            if parsed:
                last_valid_parsed = parsed

            if not wants_repetition and attempt < 2 and has_blatant_repetition(spoken_text):
                raise ValueError("Blatant internal repetition in dialogue")
            if job.get("language") == "es" and (english_drift(spoken_text) or any(
                    english_drift(action) for action in re.findall(r"\*([^*]+)\*", parsed))):
                raise ValueError("Unexpected English in Spanish reply")
            if unsupported_recalled_fact(parsed, job):
                raise ValueError("Unsupported scene fact")
            # Remove any trailing boilerplate clichés if model accidentally generated them
            cliche_cleaner = re.compile(
                r"(?i)\s*(?:¿Qué dices\? )?(?:Podemos|podemos) continuar esta conversación con total privacidad.*?(?:Man|panas|dos|\.{3})?\.?|"
                r"(?i)\s*(?:Tal vez podríamos|podríamos) explorar un poco más nuestras fantasías juntos sin compromiso\.?|"
                r"(?i)\s*(?:mantener|guardar) este pequeño secreto entre (?:nosotros dos|panas)(?:\s*Man)?(?:\.{3})?\.?",
                re.DOTALL
            )
            parsed = cliche_cleaner.sub("", parsed).strip()
            parsed = re.sub(r"(?i)\s+Man\b\.?$", ".", parsed).strip()
            user_norm = normalize_reply(latest)
            if len(user_norm) > 18:
                user_match = SequenceMatcher(None, spoken, user_norm).ratio()
                if user_match >= 0.70 or user_norm in spoken:
                    raise ValueError("Echoed player message instead of answering")
            # Solo rechaza un fragmento largo que el personaje repite por sí mismo.
            # El jugador siempre puede pedir de nuevo una cita o una frase.
            similarities = [SequenceMatcher(None, spoken, normalize_reply(old)).ratio()
                            for old in previous_replies if old.strip()]
            highest_similarity = max(similarities, default=0.0)
            if not wants_repetition and attempt < 2 and (highest_similarity >= 0.95):
                raise ValueError("Repeated previous character dialogue")
            if not wants_repetition and attempt < 2 and repeats_recent_clause(spoken_text, previous_replies):
                raise ValueError("Reused a clause from a recent reply")
            if attempt == 0 and wants_reading and len(spoken) < 190:
                print("Chat announced reading without reading; retrying", job.get("jobId", "local"), flush=True)
                messages[0]["content"] += " Tu borrador solo anunció que iba a leer. En el diálogo lee ya un pasaje original de al menos tres frases, sin preámbulo."
                continue
            print("Chat generation timing", job.get("jobId", "local"),
                  "total", round(time.monotonic() - started, 2),
                  "retry", attempt, flush=True)
            return parsed
        except Exception as error:
            print("Chat format attempt failed", job.get("jobId", "local"), attempt,
                  repr(error)[:180], flush=True)
            if str(error) == "Pure physical action without spoken dialogue":
                messages[0]["content"] += (
                    " Tu borrador solo describió una acción física sin decir nada en voz alta. "
                    "El personaje DEBE HABLARle directamente al jugador en 'dialogo' (con palabras reales). "
                    "Pon la acción en 'gesto' y las palabras que dices en 'dialogo'.")
            elif str(error) == "Blatant internal repetition in dialogue":
                messages[0]["content"] += (
                    " El borrador repitió varias veces la misma frase dentro del mensaje. "
                    "Habla con total naturalidad humana: sé breve (2 a 3 oraciones), espontánea, apasionada y directa. "
                    "PROHIBIDO repetir la misma frase dos veces en el mismo turno.")
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
    if last_valid_parsed:
        print("Chat returning last valid parsed output on fallback", job.get("jobId", "local"), flush=True)
        return last_valid_parsed
    if last_raw_reply and last_raw_reply.strip():
        cleaned_fallback = re.sub(r'[{}\[\]"\\]', '', last_raw_reply).strip()
        cleaned_fallback = re.sub(r'\s+', ' ', cleaned_fallback)
        if len(cleaned_fallback) > 5:
            return f"*Asiente* {cleaned_fallback[:250]}"
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
        content = reply_for(job)
        result = {"status": "completed", "content": content}
    except Exception as error:
        print("Chat generation failed", job_id, repr(error)[:350], file=sys.stderr, flush=True)
        result = {"status": "failed", "error": "local_chat_failed",
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

