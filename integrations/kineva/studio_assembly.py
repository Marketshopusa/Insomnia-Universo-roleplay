"""Assemble approved Kineva takes into a single episode, preserving their audio."""
import json
import subprocess
from pathlib import Path


def inspect_clip(path):
    data = json.loads(subprocess.run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path),
    ], capture_output=True, text=True, check=True, timeout=30).stdout)
    video = next((item for item in data["streams"] if item["codec_type"] == "video"), None)
    audio = next((item for item in data["streams"] if item["codec_type"] == "audio"), None)
    if not video or not audio or float(data["format"]["duration"]) <= 0:
        raise ValueError("Cada toma aprobada necesita imagen y audio.")
    return (video["codec_name"], video["width"], video["height"], video["r_frame_rate"],
            audio["codec_name"], audio["sample_rate"], audio["channels"]), float(data["format"]["duration"])


def assemble_episode(clips, destination):
    """Lossless concat only when every take has matching video and audio streams."""
    paths = [Path(clip).resolve(strict=True) for clip in clips]
    if len(paths) < 2 or len(paths) > 24:
        raise ValueError("Un episodio montado necesita entre 2 y 24 tomas aprobadas.")
    signatures, durations = zip(*(inspect_clip(path) for path in paths))
    if len(set(signatures)) != 1:
        raise ValueError("Las tomas tienen formatos incompatibles; no se ensamblarán con audio desfasado.")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if any(path == destination.resolve() for path in paths):
        raise ValueError("La salida no puede sobrescribir una toma.")
    list_path = destination.with_suffix(".concat.txt")
    temporary = destination.with_suffix(".partial.mp4")
    try:
        list_path.write_text("".join("file '" + path.as_posix().replace("'", "'\\''") + "'\n" for path in paths), encoding="utf-8")
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat",
            "-safe", "0", "-i", str(list_path), "-c", "copy", "-movflags", "+faststart",
            str(temporary),
        ], check=True, capture_output=True, timeout=240)
        _, duration = inspect_clip(temporary)
        if abs(duration - sum(durations)) > 0.5:
            raise RuntimeError("El episodio montado perdió tiempo o audio.")
        temporary.replace(destination)
        return destination
    finally:
        list_path.unlink(missing_ok=True)
        temporary.unlink(missing_ok=True)
