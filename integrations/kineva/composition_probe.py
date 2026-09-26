"""Measure coarse frame drift in a shot intended to hold a fixed composition.

This is a diagnostic, not a publication gate. Subject or camera motion both
change the score; review sampled frames and audio before accepting a take.
Requires FFmpeg and FFprobe on PATH; it does not access Supabase.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

WIDTH = 96
HEIGHT = 168


def duration_seconds(video: Path, ffprobe: str) -> float:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(video)],
        capture_output=True, text=True, check=True, timeout=30,
    )
    duration = float(result.stdout.strip())
    if duration <= 0:
        raise ValueError("Video duration must be positive")
    return duration


def grayscale_frame(video: Path, second: float, ffmpeg: str) -> bytes:
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
         "-ss", f"{second:.4f}", "-i", str(video), "-frames:v", "1",
         "-vf", f"scale={WIDTH}:{HEIGHT},format=gray",
         "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True, check=True, timeout=60,
    )
    expected = WIDTH * HEIGHT
    if len(result.stdout) != expected:
        raise RuntimeError(
            f"Could not decode frame at {second:.3f} s "
            f"(got {len(result.stdout)} bytes, expected {expected})"
        )
    return result.stdout


def probe(video: Path, ffmpeg: str, ffprobe: str) -> dict:
    duration = duration_seconds(video, ffprobe)
    if duration < 0.5:
        raise ValueError("Video must be at least half a second long")
    first = 1 / 24
    times = [first, duration * 0.25, duration * 0.5, duration * 0.9]
    reference = grayscale_frame(video, times[0], ffmpeg)
    differences = []
    for second in times[1:]:
        frame = grayscale_frame(video, second, ffmpeg)
        score = sum(abs(a - b) for a, b in zip(reference, frame)) / (
            len(reference) * 255
        )
        differences.append({"second": round(second, 3),
                            "luma_delta_from_first": round(score, 6)})
    return {
        "video": str(video),
        "duration_seconds": round(duration, 3),
        "sample_width": WIDTH,
        "sample_height": HEIGHT,
        "samples": differences,
        "max_luma_delta": max(item["luma_delta_from_first"]
                              for item in differences),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    args = parser.parse_args()
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        parser.error("FFmpeg and FFprobe are required on PATH")
    print(json.dumps(probe(args.video, ffmpeg, ffprobe), indent=2))


if __name__ == "__main__":
    main()
