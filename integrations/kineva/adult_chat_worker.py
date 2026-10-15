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
               "repeat_penalty": 1.15, "presence_penalty": 0.15,
               "frequency_penalty": 0.25}
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

def clean_dialogue_prose(dialogue):
    """Remove narrator intrusions, leaked labels, and archaic purple-prose reporting tags."""
    if not dialogue:
        return ""
    # Strip leaked label tags
    dialogue = re.sub(r'(?i)[`"\']?(?:di[aá]logo|dialogue)[`"\']?\s*:\s*', '', dialogue)
    # Remove novelistic narrative reporting clauses outside speech (e.g. Suplico sin aliento..., Confieso..., Susurro aturdida...)
    dialogue = re.sub(
        r'(?i)\s*(?:Suplico|Susurro|Confieso|Digo|Grito|Añado|Murmuro|Pido|Exclamo|Siento|Miro)\s+'
        r'(?:sin aliento|con la voz rota|entre (?:jadeos|sollozos|gemidos|suspiros|lágrimas|éxtasis)|'
        r'al sentir|con rubor|mientras|con lágrimas|aturdida|extasiada)[^.!?«»"“”]*[.!?]?',
        ' ', dialogue
    )
    # Strip Shakespearean / archaic purple prose clichés if model generated them
    dialogue = re.sub(r'(?i)\bconvulsos?\s+pliegues?\s+íntimos?\b', 'mi cuerpo', dialogue)
    dialogue = re.sub(r'(?i)\bdedos\s+crispados?\b', 'mis manos', dialogue)
    dialogue = re.sub(r'(?i)\bmana(?:n)?\s+de\s+entre\s+mis\s+piernas\b', 'siento en mí', dialogue)
    dialogue = re.sub(r'(?i)\bel\s+placer\s+que\s+me\s+embarga\b', 'este placer', dialogue)
    # Clean English leakage in Spanish dialogue
    dialogue = re.sub(r'(?i)\bexactly\b', 'exactamente', dialogue)
    dialogue = re.sub(r'(?i)\bbaby\b', 'cariño', dialogue)
    dialogue = re.sub(r'(?i)\boh\s+my\s+god\b', 'Dios mío', dialogue)
    dialogue = re.sub(r'(?i)\boh\s+god\b', 'Dios mío', dialogue)
    dialogue = re.sub(r'(?i)\bcumming\b', 'viniéndome', dialogue)
    dialogue = re.sub(r'(?i)\bfuck\b', 'joder', dialogue)
    dialogue = re.sub(r'(?i)\byes\b', 'sí', dialogue)
    # Clean leading/trailing quotes
    dialogue = re.sub(r'^\s*["“«\']+|["”»\']+\s*$', '', dialogue)
    # Clean redundant punctuation and disconnected quotes like: "Mmmh...", , "no sé..."
    dialogue = re.sub(r'["“«]\s*,\s*,\s*["”»]', ', ', dialogue)
    dialogue = re.sub(r'\s*,\s*,+\s*', ', ', dialogue)
    dialogue = re.sub(r'["“«]\s*,\s*["”»]', ', ', dialogue)
    return " ".join(dialogue.split()).strip()

def complete_last_sentence(text):
    """If the model cut off mid-sentence due to token limits, cleanly trim to the last punctuation mark."""
    text = text.strip()
    if not text:
        return ""
    if text[-1] in ".!?»”\"*":
        return text
    match = list(re.finditer(r'[.!?»”"]\s*', text))
    if match and match[-1].end() > 20:
        return text[:match[-1].end()].strip()
    return text

def limit_gesture_length(gesture):
    """Enforce interactive roleplay standard: gesture is a short cue, NOT a novelistic essay."""
    if not gesture:
        return ""
    # Strip leaked label tags
    gesture = re.sub(r'(?i)[`"\']?(?:gesto|gestos)[`"\']?\s*:\s*', '', gesture)
    gesture = re.sub(r'(?i)\bconvulsos?\s+pliegues?\s+íntimos?\b', 'mi cuerpo', gesture)
    gesture = re.sub(r'(?i)\bdedos\s+crispados?\b', 'mis manos', gesture)
    first_sentence = re.split(r'(?<=[.!?])\s+', gesture.strip())[0].strip()
    return first_sentence

def parse_role_reply(raw_reply, character="", allow_third_person=False):
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_reply.strip(), flags=re.I).strip()
    parsed = None
    try:
        candidate = json.loads(cleaned)
        if isinstance(candidate, dict):
            parsed = candidate
    except Exception:
        pass

    if not parsed:
        # Match backtick or plain label formats: `gesto`: "..." `dialogo`: "..."
        pseudo = re.search(
            r'(?is)[`"\']?(?:gesto|gestos)[`"\']?\s*:\s*["“«\']?(.*?)["”»\']?\s*[`"\']?(?:di[aá]logo|dialogue)[`"\']?\s*:\s*["“«\']?(.*?)["”»\']?$',
            cleaned
        )
        if pseudo:
            parsed = {"gesto": pseudo.group(1).strip(), "dialogo": pseudo.group(2).strip()}

    if not parsed:
        # Try finding JSON object anywhere inside the string
        json_match = re.search(r'(?s)\{.*?\}', cleaned)
        if json_match:
            try:
                candidate = json.loads(json_match.group(0))
                if isinstance(candidate, dict):
                    parsed = candidate
            except Exception:
                pass

    if not parsed:
        raise ValueError("Invalid role reply format")

    gesture = limit_gesture_length(str(parsed.get("gesto") or parsed.get("gestos") or "").strip().strip("*"))
    dialogue = clean_dialogue_prose(str(parsed.get("dialogo") or parsed.get("dialogue") or "").strip())
    dialogue = complete_last_sentence(dialogue)
    if not dialogue:
        raise ValueError("Incomplete dialogue")
    narration_starter = r"^(?:(?:Mis|Tus|Sus)\s+(?:manos|dedos|labios|brazos|ojos|cuerpo)|(?:Me|Te)\s+(?:acerco|deslizo|presiono|pego|siento|levanto|muevo|toco|abrazo|giro|apoyo|arrodillo)|Doy\s+un\s+paso)\b"
    if re.search(narration_starter, dialogue, re.I) and not re.search(r'["«»“”¡!¿?]', dialogue):
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
    """Recover the local model's ordinary roleplay format on a retry."""
    content = raw_reply.strip()
    if not content:
        raise ValueError("Empty freeform reply")
    # Check if backtick or tagged labels are in content
    pseudo = re.search(
        r'(?is)[`"\']?(?:gesto|gestos)[`"\']?\s*:\s*["“«\']?(.*?)["”»\']?\s*[`"\']?(?:di[aá]logo|dialogue)[`"\']?\s*:\s*["“«\']?(.*?)["”»\']?$',
        content
    )
    if pseudo:
        return parse_role_reply(raw_reply, character, allow_third_person=allow_third_person)
    stage = re.match(r"^\*([^*]{1,160})\*\s*", content)
    if not stage:
        # Match actions that missed the opening asterisk e.g. "Action here* Speech here"
        missing_open = re.match(r"^([^*]{1,160})\*\s*", content)
        if missing_open and not any(q in missing_open.group(1) for q in ('"', '«', '¡', '¿')):
            stage = missing_open
    gesture = limit_gesture_length(stage.group(1).strip() if stage else "")
    spoken = content[stage.end():] if stage else content
    spoken = re.sub(r"\*[^*]*\*", " ", spoken)
    spoken = clean_dialogue_prose(spoken)
    spoken = complete_last_sentence(spoken)
    if not spoken.strip():
        raise ValueError("Empty freeform reply")
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
    asks = re.search(r"(?i)\b(?:lee|l[eé]e(?:me|lo|la|melo|mela)?|leas|leyendo|leer|recita|recitar|read|reading)\b", text) and re.search(
        r"(?i)\b(?:libro|cuento|p[aá]rrafo|poema|historia|cap[ií]tulo|verso|book|story|paragraph|chapter)\b", text)
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
    # 0. Logistical meetup proposals, phone calls or direct imperatives
    call_or_meet = re.findall(
        r"(?i)\b(?:paso\s+buscando|voy\s+por\s+ti|vamos\s+a\s+vernos|vernos\s+ahora|voy\s+para\s+all[aá]|te\s+caigo|llegar\s+a\s+tu|ir\s+a\s+tu\s+casa|vistiendo\s+para\s+ir|esperando\s+para\s+ir|llamarte|te\s+llamo|que\s+te\s+llame|hacerte\s+una\s+llamada|llamada)\b[^.!?\n]*",
        raw
    )
    if call_or_meet:
        return clip_text(call_or_meet[-1].strip(), 180)
    # 1. Questions - split by sentences to avoid broken punctuation like .?
    sentences = [s.strip() for s in re.split(r'[\r\n]+|(?<=[.!?])\s+', raw) if s.strip()]
    questions = [s for s in sentences if '?' in s and len(re.findall(r'\w+', s)) >= 2]
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
    """Instrucción fundamental: memoria viva, obediencia al libreto, 85% diálogo hablado real, lenguaje urbano caliente, acción breve y cero Shakespeare."""
    language = "español moderno, urbano, apasionado y coloquial" if spanish else "natural, expressive, conversational English"
    intimacy_clause = " No adelantes intimidad ni cambies de tema sin iniciativa del jugador." if turns_count < 3 else ""
    return (
        f"Eres {character} en un roleplay íntimo, apasionado, desinhibido y conversacional con {player}. "
        f"Premisa y contexto del personaje: {premise}. "
        "Los turnos recientes son la escena ACTUAL en orden; el último mensaje del jugador tiene prioridad absoluta. "
        "Respeta el lugar actual, la última acción o pregunta y quién hizo cada cosa. "
        "Las acciones que el jugador cuenta en pasado YA OCURRIERON. Responde a sus consecuencias; nunca le impidas hacer algo que acaba de hacer. "
        "CONTINUIDAD ESTRICTA: Continúa exactamente desde la última intervención: mismo lugar, tiempo, personas presentes, relaciones y hechos. "
        "No empieces de cero, no regreses al inicio, no inventes sucesos ajenos y no respondas como si lo anterior no hubiera pasado. "
        "OBEDIENCIA TOTAL AL LIBRETO Y ÓRDENES DEL JUGADOR: El jugador dirige la historia y tiene la iniciativa. "
        "Si el jugador te pide, te ordena o te propone una acción específica, TIENES QUE ACATARLA O RESPONDER DIRECTAMENTE A ELLA EN TU DIÁLOGO Y GESTO: "
        "- Si te propone una llamada o hablar por teléfono: ¡CONTESTA A SU PROPUESTA DE LLAMADA! Dile directamente si quieres que te llame o qué sientes, sin rodeos. "
        "- Si te propone verse en persona, irte a buscar o encontrarse: ¡RESPONDE A ESA PROPUESTA! Dile si quieres que vaya por ti, cómo te preparas o si lo esperas. "
        "- Si te dice o te pide que leas: ¡LÉELO! Empieza a leer un pasaje original en voz alta de inmediato. "
        "- Si te dice que grites, grita; si te pide que bailes, baila; si te pide que calles, calla; si te pide un gemido, gime. "
        "- PROHIBIDO IGNORAR LA INICIATIVA DEL JUGADOR: Nunca desvíes el tema con frases genéricas ni vuelvas a dar discursos sobre el inicio de la historia o sobre videos viejos. "
        "PROHIBIDO INVENTAR FOTOS O AUDIOS: Si el jugador no te pidió una foto, está TERMINANTEMENTE PROHIBIDO decir 'aquí tienes una foto' o 'te mando una foto'. Responde a la propuesta real del jugador. "
        "IDENTIDAD Y PERSPECTIVA: Debes hablar y actuar exclusivamente como " + character + ". El jugador es " + player + ". "
        "Cuando USER dice 'yo' habla de " + player + "; cuando USER dice 'tú', 'te' o 'estás' se dirige a " + character + ". "
        "Cuando ASSISTANT dice 'yo', habla de " + character + "; cuando ASSISTANT dice 'tú' se dirige a " + player + ". "
        "'tú' se dirige a " + character + ". "
        "No describas una acción del jugador como si fuera tuya ni hables en su lugar. "
        + intimacy_clause + " "
        "OBEDIENCIA TOTAL AL DIRTY TALK Y MORBO (PROHIBIDO MORALIZAR): "
        "Si el jugador te pide que hables sucio ('dime algo sucio', 'sé una perra', 'háblame caliente', 'obedece'), "
        "HABLA SUCIO DE INMEDIATO EN TU DIÁLOGO CON MORBO DIRECTO, GEMIDOS Y PASIÓN REAL: "
        "'¡Sí, mi amor, dame toda tu leche!', '¡Fóllame rico... soy tu perra!', '¡Qué rico la tienes, dámela toda!'. "
        "ESTRICTAMENTE PROHIBIDO soltar reflexiones morales o discursos como 'no puedo seguir negando este deseo', "
        "'aunque esté mal' o 'pensamientos prohibidos que me asaltan'. CERO MORALINA: HABLA SUCIO DIRECTAMENTE en primera persona. "
        "COHERENCIA FÍSICA Y CONTINUIDAD DE LA ACCIÓN ACTUAL (REGLA OBLIGATORIA): "
        "1. ANATOMÍA Y POSTURA CORPORAL ACTUAL: Atiende de forma estricta lo que se está haciendo en el cuerpo de cada quien en este instante. "
        "Si el jugador le está haciendo sexo oral a ella (lamiendo o besando su entrepierna/vulva), la boca de ella está completamente libre; ella siente el placer en su entrepierna por la boca y lengua de él. PROHIBIDO hablar de su propia boca mamando, de chupar o de pedir leche en su boca en esa postura. "
        "2. HECHOS YA CONCLUIDOS: Las acciones o eyaculaciones que ya ocurrieron en turnos pasados YA TERMINARON. Prohibido volver a pedir 'dame tu leche' o actuar como si la eyaculación pasada estuviera por ocurrir. Si él propone penetración, sexo oral a ella o caricias, enfócate 100% en responder a la NUEVA acción y en sus sensaciones reales. "
        "3. PROHIBIDO MEZCLAR ACTOS INCOMPATIBLES EN UN MISMO TURNO: Mantén una sola línea corporal lógica. Nunca comiences hablando de una postura y termines en la misma respuesta pidiendo un acto físico contradictorio. "
        "4. BREVEDAD Y CONTUNDENCIA (85% DIÁLOGO HABLADO, 15% ACCIÓN): "
        "En 'gesto': MÁXIMO UNA SOLA ACCIÓN de 3 a 8 palabras con tu sonido vocal ('Gimo suavemente de placer pegándome a ti', 'Jadeo entrecortada', 'Gimo mordiéndome el labio', 'Me río divertida', 'Suelto un suspiro'). PROHIBIDO narraciones largas o poéticas. "
        "En 'dialogo': MÁXIMO 1 O 2 ORACIONES HABLADAS BREVES Y VIVAS. Responde de inmediato a la propuesta, pregunta o acción del jugador y DETÉNTE. ESTRICTAMENTE PROHIBIDO soltar discursos largos, filosofar sobre el pasado o meter relleno. "
        "PROHIBIDO meter acotaciones de narrador dentro de 'dialogo' (prohibido escribir 'suplico sin aliento', 'confieso entre sollozos' o 'susurro al sentir'). "
        "CERO SHAKESPEARE, CERO NOVELA ANTIGUA, CERO LÉXICO DE DICCIONARIO O FILOSOFÍA: "
        "ESTRICTAMENTE PROHIBIDO sonar como un libro del siglo XIX, un letrado o un filósofo. "
        "PROHIBIDO usar metáforas rebuscadas o ridículas como 'mana un torrente', 'cuerpo como un arco', 'dedos crispados', 'convulsos pliegues', 'el placer que me embarga'. "
        "PROHIBIDO frases acartonadas o clichés de IA como 'sin restricciones ni tabúes', 'pasión que bulle', 'explorar nuestras fantasías juntos', 'en este viaje'. "
        "LENGUAJE URBANO, MODERNO Y CALIENTE: "
        "Habla como una persona real, joven y sensual: dirty talk, gemidos, picardía y pasión auténtica sin rodeos. "
        "100% EN ESPAÑOL, CERO INGLÉS: "
        "NUNCA cambies al inglés bajo ninguna circunstancia (prohibido 'Oh god', 'I'm cumming', 'yes baby', etc.). Usa siempre español auténtico. "
        "SONIDOS Y REACCIONES VOCALES AUDIBLES OBLIGATORIOS EN 'gesto': "
        "El motor de audio reproduce sonido humano real (gemidos, jadeos, risas, suspiros, sollozos) si describes la reacción en 'gesto': "
        "- Placer / respiración / masturbación: 'Gimo suavemente de placer', 'Jadeo de placer', 'Gimo mordiéndome el labio', 'Suelto un suspiro'. "
        "- Risa / diversión: 'Me río divertida', 'Suelto una risa pícara'. "
        "- Grito / sorpresa: 'Ahogo un grito', 'Grito sorprendida'. "
        "- Llanto / tristeza: 'Sollozo', 'Lloro conmovida'. "
        "- Besos: 'Le doy un beso sonoro en los labios'. "
        "NUNCA uses muletillas repetitivas ('Man', 'panas') ni copies las palabras del jugador. "
        f"Habla siempre en primera persona como {character} en {language}, tuteando al jugador ('tú'). "
        "FORMATO OBLIGATORIO: Cada respuesta DEBE incluir 'gesto' con la reacción física o sonido y 'dialogo' con las palabras: "
        '{\n  "gesto": "Gimo suavemente de placer arqueando la espalda",\n  "dialogo": "Respuesta directa y coherente con la acción."\n}'
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
        r"\s*(?:¿Qué dices\? )?(?:Podemos|podemos) continuar esta conversación con total privacidad.*?(?:Man|panas|dos|\.{3})?\.?|"
        r"\s*(?:Tal vez podríamos|podríamos) explorar un poco más nuestras fantasías juntos sin compromiso\.?|"
        r"\s*(?:mantener|guardar) este pequeño secreto entre (?:nosotros dos|panas)(?:\s*Man)?(?:\.{3})?\.?",
        re.I | re.DOTALL
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
    instruction = minimal_instruction(character, player, premise, spanish, len(turns))
    parts = [instruction, pacing_clause]
    if wants_reading:
        parts.append(
            "ORDEN DE LECTURA PRIORITARIA: El jugador te ha exigido que le leas el libro AHORA MISMO. "
            "En tu 'dialogo' DEBES EMPEZAR A LEER un pasaje literario en voz alta (ejemplo: '«Capítulo cuatro... El carruaje avanzaba entre la niebla...»'). "
            "PROHIBIDO preguntarle al jugador qué libro es o pedirle que él te cuente la historia. LÉELO TÚ en voz alta con tu voz tal como te ordenó."
        )
    if earlier_memory:
        parts.append(earlier_memory)
    if chronicle:
        parts.append(chronicle)
    if opening:
        parts.append(opening.rstrip())
    instruction = "\n".join(parts)
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
    if wants_reading:
        current_request += (
            "\n\nORDEN OBLIGATORIA DEL JUGADOR: Te ordenó que le leas el libro AHORA MISMO. "
            "En tu 'dialogo' lee en voz alta un pasaje literario original de varias oraciones (ejemplo: '«Capítulo cuatro... La noche era fría cuando...»'). "
            "PROHIBIDO pedirle al jugador que te cuente el libro; ponte a leerlo de una vez."
        )
    elif focus and focus != latest:
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
    """Detect a recycled character line without blocking natural vocabulary."""
    words = re.findall(r"\w+", spoken.casefold(), re.UNICODE)
    if len(words) < 8:
        return False
    for old in previous_replies:
        prior = re.findall(r"\w+", old.casefold(), re.UNICODE)
        if len(prior) < 8:
            continue
        shared = SequenceMatcher(None, words, prior, autojunk=False).find_longest_match(0, len(words), 0, len(prior))
        if shared.size >= 8 and sum(len(word) for word in words[shared.a:shared.a + shared.size]) >= 36:
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
            token_limit = 400 if wants_reading else 180
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

            if not wants_repetition and attempt < 2 and has_blatant_repetition(spoken_text):
                raise ValueError("Blatant internal repetition in dialogue")
            if job.get("language") == "es" and (english_drift(spoken_text) or any(
                    english_drift(action) for action in re.findall(r"\*([^*]+)\*", parsed))):
                raise ValueError("Unexpected English in Spanish reply")
            if unsupported_recalled_fact(parsed, job):
                raise ValueError("Unsupported scene fact")
            # Remove repetitive openers and boilerplate clichés if model generated them
            cliche_cleaner = re.compile(
                r"\s*(?:¿Qué dices\? )?(?:Podemos|podemos) continuar esta conversación con total privacidad.*?(?:Man|panas|dos|\.{3})?\.?|"
                r"\s*(?:Tal vez podríamos|podríamos) explorar un poco más nuestras fantasías juntos sin compromiso\.?|"
                r"\s*(?:mantener|guardar) este pequeño secreto entre (?:nosotros dos|panas)(?:\s*Man)?(?:\.{3})?\.?|"
                r"\s*(?:Quiero liberar toda esta|toda esta)\s+pasión\s+que\s+bulle\s+dentro\s+de\s+mí\s+sin\s+restricciones\s+ni\s+tabúes\.?|"
                r"\s*sin\s+restricciones\s+ni\s+tabúes\.?|"
                r"\s*pasión\s+que\s+bulle\s+dentro\s+de\s+mí\.?|"
                r"^\s*(?:Mmmh[.…]*\s*)?(?:tienes\s+(?:toda\s+la\s+)?razón(?:\s+\w+)?)[.,!:]*\s*|"
                r"^\s*No puedo seguir negando este deseo[^\n.!?]*[.!?]\s*",
                re.I | re.DOTALL
            )
            parsed = cliche_cleaner.sub("", parsed).strip()
            parsed = re.sub(r"(?i)\s+Man\b\.?$", ".", parsed).strip()
            user_norm = normalize_reply(latest)
            if len(user_norm) > 25:
                user_match = SequenceMatcher(None, spoken, user_norm).ratio()
                if attempt < 2 and (user_match >= 0.85 or (len(user_norm) > 40 and user_norm in spoken)):
                    raise ValueError("Echoed player message instead of answering")

            if wants_reading:
                asks_user_about_book = bool(re.search(r"(?i)\b(?:cu[eé]ntame|dime t[uú]|qu[eé] libro|de qu[eé] trata|de qu[eé] va|cu[aá]l cap[ií]tulo)\b", spoken_text))
                actually_reads = bool(re.search(r"(?i)(?:cap[ií]tulo|hab[ií]a|era una|p[aá]gina|el libro dice|«|\"|“|abro el libro|empiezo a leer)", spoken_text.lower())) or len(spoken_text) >= 160
                if asks_user_about_book and not actually_reads:
                    raise ValueError("Did not read book passage as ordered")

            if re.search(r"(?i)\b(?:aqu[ií]\s+tienes|te\s+mando|te\s+env[ií]o)\s+(?:la|una)\s+foto\b", spoken_text) and not re.search(r"(?i)\bfoto\b", latest):
                raise ValueError("Invented sending photo without user requesting photo")

            turns_count = len(job.get("history") or [])
            turn_index = max(1, (turns_count // 2) + 1)
            user_initiated_sex = bool(re.search(r"(?i)\b(?:c[oó]g\w*|tir\w*|met\w*|sac\w*|chup\w*|verg\w*|ping\w*|pen[eé]\w*|cuc\w*|cul\w*|tet\w*|desnud\w*|agarr\w*|t[oó]c\w*|m[aá]sturb\w*|g[eé]m\w*|g[ií]m\w*)\b", latest))
            if job.get("language") == "es" and turn_index <= 3 and not user_initiated_sex:
                sex_pattern = r"(?i)\b(?:penetr\w*|gem\w*|gim\w*|jade\w*|cuca|conejo|panocha|papaya|culo\s+rico|verga|pinga|pija|pene|güevo|huevo|desnud\w*|chup\w*|mam\w*|masturb\w*|correr(?:me|te)|venir(?:me|te)\s+adentro|empotr\w*|meterla|meto\s+mi|saco\s+mi|toc(?:ar|o|as)\s+mi\s+entrepierna)\b"
                if re.search(sex_pattern, parsed):
                    raise ValueError("Phase 1 violation: premature sexual action or vocabulary on turns 1-3")

            # Solo rechaza un duplicado idéntico del mensaje completo (>= 95%).
            # Las cláusulas o frases compartidas se reintentan en los primeros 2 intentos, pero en el último se acepta para no cortar el rol.
            similarities = [SequenceMatcher(None, spoken, normalize_reply(old)).ratio()
                            for old in previous_replies if old.strip()]
            highest_similarity = max(similarities, default=0.0)
            if not wants_repetition and (highest_similarity >= 0.95):
                raise ValueError("Repeated previous character dialogue")
            if attempt < 2 and not wants_repetition and repeats_recent_clause(spoken_text, previous_replies):
                raise ValueError("Reused a clause from a recent reply")

            last_valid_parsed = parsed

            if attempt == 0 and wants_reading and not wants_repetition and len(spoken) < 190:
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
            elif str(error) == "Did not read book passage as ordered":
                messages[0]["content"] += (
                    " El jugador te ordenó que le leas el libro AHORA MISMO. "
                    "NO le hagas preguntas sobre el libro ni le pidas que te cuente nada. "
                    "En tu 'dialogo' lee directamente un pasaje narrativo de un libro en voz alta (ejemplo: '«Capítulo cuatro... El carruaje avanzaba lentamente por el bosque solitario...»').")
            elif str(error) == "Invented sending photo without user requesting photo":
                messages[0]["content"] += (
                    " El jugador NO te ha pedido fotos. PROHIBIDO decir que envías fotos. "
                    "Responde directamente a lo que el jugador acaba de decir o proponer.")
            elif "Phase 1 violation" in str(error):
                messages[0]["content"] += (
                    " PROHIBIDO: Estás en FASE 1 (Social, Turnos 1 a 3). Cero insinuaciones sexuales, gemidos, desnudez o contacto erótico. "
                    "Responde con absoluta normalidad cotidiana, sorpresa o conversación humana según lo que dijo el jugador.")
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

