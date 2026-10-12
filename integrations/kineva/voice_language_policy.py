"""Language and cache contract for H3 voice references."""
import copy
import hashlib
import json
import unicodedata

SPANISH_REFERENCE = "Buenos d\u00edas. Hoy conversamos sobre historias, tecnolog\u00eda y los peque\u00f1os detalles de la vida."

def spoken_language(plan, character_name):
    for shot in plan.get("shots", []):
        for line in shot.get("dialogue", []):
            if line.get("speaker") == character_name and str(line.get("language") or "").strip():
                return str(line["language"]).strip()
    return str(plan.get("language") or "Spanish").strip()

def is_spanish(language):
    value = unicodedata.normalize("NFKD", language.casefold())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return value in ("spanish", "espanol", "es") or value.startswith("es-")

def prepare_voice(plan, character, reference_text, seed, steps, sampler, scheduler):
    language = spoken_language(plan, character["name"])
    prepared = copy.deepcopy(character)
    if is_spanish(language):
        language = "Spanish"
        if not str(reference_text or "").strip() or str(reference_text).startswith("The morning train was late again"):
            reference_text = SPANISH_REFERENCE
        prepared["voice"] = (str(prepared.get("voice") or "").rstrip(". ") +
            ". Fluent Latin American Spanish pronunciation, warm natural conversational delivery, "
            "relaxed rhythm, clear articulation and expressive intonation.")
    signature = {
        "version": 2, "language": language, "reference_text": reference_text,
        "voice": prepared.get("voice", ""), "identity": prepared.get("identity", ""),
        "seed": seed, "steps": steps, "sampler": sampler, "scheduler": scheduler,
    }
    digest = hashlib.sha256(json.dumps(signature, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
    return {"character": prepared, "language": language, "reference_text": reference_text,
            "seed": seed, "cache_key": character["name"] + "__voice_v2_" + digest}
