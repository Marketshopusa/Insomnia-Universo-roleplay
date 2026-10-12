"""Install the versioned Spanish voice-reference fix into local MinimaxStoryBuilder."""
from pathlib import Path
import ast
import shutil
import datetime

OLD = '        voices, fresh = {}, []\n        for character in wanted:\n            name = character["name"]\n            cached = store.load_voice(name) if store is not None else None\n            if cached is not None:\n                voices[name] = cached\n            else:\n                fresh.append(character)\n\n        for i, character in enumerate(fresh):\n            name = character["name"]\n            logging.info("MinimaxStoryBuilder: voicing %s (%d/%d)", name, i + 1, len(fresh))\n            audio = director_util.render_voice(\n                character, sheets[name], model, clip, vae, audio_vae,\n                seed + i, reference_text, style=style, steps=steps,\n                sampler=sampler_name, scheduler=scheduler)\n            voices[name] = audio\n            if store is not None:\n                try:\n                    store.save_voice(name, audio)\n'
NEW = '        from .kineva_voice_language_policy import prepare_voice\n        voices, fresh = {}, []\n        for i, character in enumerate(wanted):\n            request = prepare_voice(story_plan, character, reference_text,\n                                    seed + i, steps, sampler_name, scheduler)\n            name = character["name"]\n            cached = store.load_voice(request["cache_key"]) if store is not None else None\n            if cached is not None:\n                voices[name] = cached\n            else:\n                fresh.append(request)\n\n        for i, request in enumerate(fresh):\n            character = request["character"]\n            name = character["name"]\n            logging.info("MinimaxStoryBuilder: voicing %s (%d/%d) language=%s cache=%s",\n                         name, i + 1, len(fresh), request["language"], request["cache_key"])\n            audio = director_util.render_voice(\n                character, sheets[name], model, clip, vae, audio_vae,\n                request["seed"], request["reference_text"], style=style, steps=steps,\n                sampler=sampler_name, scheduler=scheduler, language=request["language"])\n            voices[name] = audio\n            if store is not None:\n                try:\n                    store.save_voice(request["cache_key"], audio)\n'
def install(package):
    package = Path(package)
    backup = package / ("kineva_voice_backup_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
    changes = {}
    node = package / "nodes.py"
    text = node.read_text(encoding="utf-8")
    if NEW not in text:
        if text.count(OLD) != 1:
            raise RuntimeError("Unknown H3 voice-casting implementation; no files changed")
        changes[node] = text.replace(OLD, NEW, 1)
    director = package / "director.py"
    text = director.read_text(encoding="utf-8")
    old_signature = 'ref_image_size="match"):\n    """Render one character'
    new_signature = 'ref_image_size="match", language="English"):\n    """Render one character'
    old_call = 'prompts.build_voice_prompt(character, reference_text, style=style)'
    new_call = 'prompts.build_voice_prompt(character, reference_text, style=style, language=language)'
    if new_call not in text:
        if text.count(old_signature) != 1 or text.count(old_call) != 1:
            raise RuntimeError("Unknown H3 voice-render implementation; no files changed")
        text = text.replace(old_signature, new_signature, 1).replace(old_call, new_call, 1)
        changes[director] = text
    policy = Path(__file__).with_name("voice_language_policy.py").read_text(encoding="utf-8")
    changes[package / "kineva_voice_language_policy.py"] = policy
    for text in changes.values():
        ast.parse(text)
    backup.mkdir()
    for path, text in changes.items():
        if path.exists():
            shutil.copy2(path, backup / path.name)
        path.write_text(text, encoding="utf-8")
    print("Voice-language fix installed; restart ComfyUI. Backup:", backup)

if __name__ == "__main__":
    import sys
    install(sys.argv[1])
