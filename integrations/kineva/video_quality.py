"""Measured video signals for side-by-side engine review; human approval is still required."""
import json
import os
import subprocess
import sys
from pathlib import Path

from image_quality import TOOLS, count_faces

sys.path.insert(0, str(TOOLS))
import cv2
import numpy as np


def inspect(path):
    path = Path(path)
    probe = json.loads(subprocess.run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ], capture_output=True, text=True, check=True, timeout=30).stdout)
    stream = next(item for item in probe["streams"] if item["codec_type"] == "video")
    duration = float(probe["format"]["duration"])
    positions = [max(.1, min(duration-.1, duration*part)) for part in (.06, .5, .94)]
    frames = []
    for second in positions:
        data = subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(second),
            "-i", str(path), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"
        ], capture_output=True, check=True, timeout=30).stdout
        gray = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            raise RuntimeError("No se pudo extraer un fotograma.")
        frames.append({"second": round(second, 3), "face_count": count_faces(data),
                       "sharpness_laplacian": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2)})
    return {"file": str(path), "width": stream["width"], "height": stream["height"],
            "duration": duration, "audio": any(s["codec_type"] == "audio" for s in probe["streams"]),
            "frames": frames}


if __name__ == "__main__":
    print(json.dumps([inspect(path) for path in sys.argv[1:]], indent=2))
