"""The S4 API implements synchronization only; login UI and verification are later sprints."""
import json
import os
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .auth import authenticate
from .contracts import AudioInput, BatchInput, BatchResponse
from .repository import DetectionRepository
from .storage import AudioStorage

app = FastAPI(title="BirdNet Local", docs_url=None, redoc_url=None)


def repository() -> DetectionRepository:
    return DetectionRepository()


def storage() -> AudioStorage:
    return AudioStorage()


@app.middleware("http")
async def bounded_body(request: Request, call_next):
    # The metadata endpoint never accepts audio or unbounded JSON bodies.
    if request.method == "POST":
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 128 * 1024:
                return JSONResponse({"detail": "Request body exceeds metadata limit"}, status_code=413)
        request._body = bytes(data)
    return await call_next(request)


@app.post("/v1/detections/batch", response_model=BatchResponse)
def batch(payload: BatchInput, owner: UUID = Depends(authenticate), repo: DetectionRepository = Depends(repository), audio: AudioStorage = Depends(storage)) -> BatchResponse:
    for row in payload.detections:
        if (row.status == "confirmed") != (row.confidence >= 0.80):
            raise HTTPException(422, "Confidence and verification state disagree")
        if row.audio_path:
            if row.status != "provisional":
                raise HTTPException(422, "Only provisional detections can include audio")
            if repo.get_owned(owner, row.id) is None:
                raise HTTPException(404, "Detection must be synchronized before uploading audio")
            audio.verify(owner, row.id, row.audio_path)
    return repo.batch(owner, payload.detections)


@app.post("/v1/detections/{detection_id}/audio-url")
def audio_url(detection_id: UUID, payload: AudioInput, owner: UUID = Depends(authenticate), repo: DetectionRepository = Depends(repository), audio: AudioStorage = Depends(storage)) -> dict[str, str]:
    row = repo.get_owned(owner, detection_id)
    if row is None:
        raise HTTPException(404, "Detection not found")
    if row["estado"] != "provisional":
        raise HTTPException(422, "Only provisional audio may be uploaded")
    return audio.sign(owner, detection_id)


@app.get("/v1/model/latest")
def latest_model() -> dict:
    manifest_file = Path(os.environ.get("MODEL_MANIFEST_PATH", "public/models/manifest.json"))
    try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8-sig"))
        resource_base = os.environ.get("MODEL_RESOURCE_BASE_URL", "/models/").rstrip("/")
        for field in ("model_file", "labels_file"):
            if not manifest[field].startswith(("https://", "http://", "/")):
                manifest[field] = f"{resource_base}/{manifest[field]}"
        return manifest
    except (OSError, ValueError, KeyError):
        raise HTTPException(503, "Model manifest unavailable") from None
