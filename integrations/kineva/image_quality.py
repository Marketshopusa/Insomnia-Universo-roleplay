"""Conservative review of generated scene images before publication.

Only checks obvious excess faces; no claim of anatomy, identity, or action fidelity.
"""
import os
import sys
from pathlib import Path

TOOLS = Path(os.environ.get("KINEVA_IMAGE_TOOLS", str(Path.home() / "AppData/Local/KinevaImageTools")))
MODEL = TOOLS / "face_detection_yunet_2023mar.onnx"


def count_faces(png):
    if not MODEL.is_file():
        raise RuntimeError("Falta el detector de rostros para revisar la ilustración.")
    sys.path.insert(0, str(TOOLS))
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("Falta OpenCV para revisar la ilustración.") from exc
    frame = cv2.imdecode(np.frombuffer(png, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("No se pudo leer la ilustración.")
    height, width = frame.shape[:2]
    detector = cv2.FaceDetectorYN.create(str(MODEL), "", (width, height), score_threshold=0.6)
    _, faces = detector.detect(frame)
    return 0 if faces is None else len(faces)


def review(png, max_people):
    if not max_people:
        return {"face_count": None, "accepted": True}
    faces = count_faces(png)
    return {"face_count": faces, "accepted": faces <= max_people}
