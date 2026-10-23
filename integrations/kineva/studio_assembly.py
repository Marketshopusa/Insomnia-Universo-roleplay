"""Assemble approved Kineva takes into a single episode, preserving and normalizing their audio."""
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
    """Lossless concat when takes match, robust normalized assembly fallback."""
    paths = [Path(clip).resolve(strict=True) for clip in clips]
    if len(paths) < 1 or len(paths) > 48:
        raise ValueError("Un episodio montado necesita entre 1 y 48 tomas aprobadas.")
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if any(path == destination.resolve() for path in paths):
        raise ValueError("La salida no puede sobrescribir una toma.")

    if len(paths) == 1:
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(paths[0]),
            "-c", "copy", "-movflags", "+faststart", str(destination),
        ], check=True, capture_output=True, timeout=120)
        return destination

    signatures, durations = zip(*(inspect_clip(path) for path in paths))
    list_path = destination.with_suffix(".concat.txt")
    temporary = destination.with_suffix(".partial.mp4")

    # Fast lossless concat if all signatures match
    if len(set(signatures)) == 1:
        try:
            list_path.write_text("".join("file '" + path.as_posix().replace("'", "'\\''") + "'\n" for path in paths), encoding="utf-8")
            subprocess.run([
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat",
                "-safe", "0", "-i", str(list_path), "-c", "copy", "-movflags", "+faststart",
                str(temporary),
            ], check=True, capture_output=True, timeout=240)
            temporary.replace(destination)
            return destination
        except Exception:
            pass
        finally:
            list_path.unlink(missing_ok=True)
            temporary.unlink(missing_ok=True)

    # Robust normalization fallback for differing rates/resolutions
    try:
        inputs = []
        filter_parts = []
        for i, p in enumerate(paths):
            inputs.extend(["-i", str(p)])
            filter_parts.append(f"[{i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v{i}];[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a{i}];")
        concat_filter = "".join(filter_parts) + "".join(f"[v{i}][a{i}]" for i in range(len(paths))) + f"concat=n={len(paths)}:v=1:a=1[outv][outa]"
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", concat_filter, "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(temporary)]
        subprocess.run(cmd, check=True, capture_output=True, timeout=360)
        temporary.replace(destination)
        return destination
    finally:
        temporary.unlink(missing_ok=True)
