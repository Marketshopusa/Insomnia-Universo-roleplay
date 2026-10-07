"""Direct, single-shot Kineva plan; no external LLM executable."""
import hashlib
import json
import re

FPS = 24

def _fields(prompt, exact_dialogue):
    lines = str(prompt or "").strip().splitlines()
    spoken = str(exact_dialogue or "").strip()
    kept = []
    for index, line in enumerate(lines):
        match = re.match(r"^\s*(?:03\W*)?(?:FRASE\s+EXACTA|EXACT\s+DIALOGUE|DIALOGUE|DIALOGO)\s*:?\s*(.*)$", line, re.I)
        if match:
            candidate = match.group(1).strip()
            if not candidate and index + 1 < len(lines):
                candidate = lines[index + 1].strip()
            if not spoken:
                spoken = candidate
            continue
        if index and kept and re.match(r"^\s*(?:03\W*)?(?:FRASE\s+EXACTA|EXACT\s+DIALOGUE|DIALOGUE|DIALOGO)\s*:?\s*$", lines[index - 1], re.I):
            continue
        kept.append(line)
    action = "\n".join(kept).strip()
    if not action:
        raise ValueError("Kineva: escribe una accion para la toma.")
    if spoken.startswith("[") and spoken.endswith("]"):
        raise ValueError("Kineva: reemplaza el ejemplo entre corchetes por la frase real.")
    return action, spoken

class KinevaDirectShotPlan:
    CATEGORY = "Kineva"
    FUNCTION = "build"
    RETURN_TYPES = ("STORY_PLAN", "STRING")
    RETURN_NAMES = ("story_plan", "plan_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "prompt": ("STRING", {"multiline": True, "default": ""}),
            "exact_dialogue": ("STRING", {"multiline": True, "default": ""}),
            "style": ("STRING", {"default": "photorealistic, natural lighting"}),
            "duration_seconds": ("FLOAT", {"default": 8.0, "min": 5.17, "max": 15.08, "step": 0.1}),
            "camera": ("STRING", {"default": "fixed medium shot; no zoom, cuts or reframing"}),
            "primary_character": ("STRING", {"default": "the adult person in the uploaded reference image"}),
            "secondary_character": ("STRING", {"default": ""}),
            "location_name": ("STRING", {"default": "the setting in the uploaded reference image"}),
            "location_description": ("STRING", {"default": "Preserve the original room, geometry, lighting and surfaces."}),
        }}

    def build(self, prompt, exact_dialogue="", style="photorealistic, natural lighting",
              duration_seconds=8.0, camera="fixed medium shot; no zoom, cuts or reframing",
              primary_character="the adult person in the uploaded reference image",
              secondary_character="", location_name="the setting in the uploaded reference image",
              location_description="Preserve the original room, geometry, lighting and surfaces."):
        action, spoken = _fields(prompt, exact_dialogue)
        frames = max(124, min(362, int(round(float(duration_seconds) * FPS))))
        frames += (5 - frames) % 17
        if frames > 362:
            frames = 362
        seconds = frames / FPS
        person = str(primary_character or "").strip() or "the adult person in the uploaded reference image"
        second = str(secondary_character or "").strip()
        place = str(location_name or "").strip() or "the setting in the uploaded reference image"
        setting = str(location_description or "").strip()
        if second and second.casefold() == person.casefold():
            raise ValueError("Kineva: usa nombres distintos para los dos personajes.")
        participants = [person] + ([second] if second else [])
        sig = json.dumps([action, spoken, style, frames, camera, participants, place, setting], ensure_ascii=False)
        digest = hashlib.sha256(sig.encode("utf-8")).hexdigest()
        seed = int(digest[:16], 16)
        visual = (("Preserve the identity of each separately referenced adult. "
                   "Keep each face on its own body. Set the action at " + place + ". " + setting + " " + action)
                  if second else
                  ("The uploaded image is the exact first frame. Preserve the subject's identity, "
                   "clothing, spatial layout and lighting. " + action))
        dialogue = ([{"speaker": person, "language": "Spanish", "line": spoken,
                      "delivery": "natural", "off_screen": False}] if spoken else [])
        plan = {
            "cast": {"style": str(style), "mood": "", "characters": [{
                "name": person, "identity": person, "appearance": "Preserve the uploaded appearance.",
                "voice": "Natural adult speaking voice.", "seen": True}] + ([{
                "name": second, "identity": second, "appearance": "Use the separate cast reference.",
                "voice": "Natural adult speaking voice.", "seen": True}] if second else []),
                "groups": [], "locations": [{"name": place,
                "description": setting}]},
            "scenes": [{"text": visual, "summary": action, "actions": [action],
                "location": place, "moves_to": "", "characters": participants,
                "groups": [], "time": "present", "pace": "normal", "shots": 1}],
            "shots": [{"index": 0, "seed": seed, "text": visual, "chars": len(action),
                "frames": frames, "seconds": seconds, "characters": participants,
                "groups": [], "location": place, "pov": "", "time": "present",
                "pace": "normal", "beats": [{"start": 0.0, "end": seconds,
                    "action": action, "cut": False, "camera": "", "location": "",
                    "time": ""}], "camera": str(camera), "action": action,
                "dialogue": dialogue, "vocals": "", "soundscape": "Natural ambient sound",
                "music": "N/A", "continuity": "single continuous take"}],
            "_project_id": "kineva_direct_" + digest[:16], "_story_key": digest[16:32],
            "_seed": seed, "_kineva_direct_exact_dialogue": spoken,
            "_kineva": {"source": "direct_shot_v1"}}
        return (plan, json.dumps(plan, ensure_ascii=False, indent=2))
