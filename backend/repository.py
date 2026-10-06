"""Use one database transaction per batch; RLS remains active for every query."""
import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

from .contracts import BatchResponse, DetectionInput


class DetectionRepository:
    @contextmanager
    def transaction(self, owner: UUID) -> Iterator[psycopg.Connection]:
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise HTTPException(503, "Database is not configured")
        try:
            with psycopg.connect(url, connect_timeout=10, row_factory=dict_row) as connection:
                connection.execute("SET LOCAL ROLE authenticated")
                connection.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(owner), "role": "authenticated"}),))
                yield connection
        except psycopg.Error:
            raise HTTPException(503, "Database operation failed; retry later") from None

    def get_owned(self, owner: UUID, detection: UUID) -> dict | None:
        with self.transaction(owner) as connection:
            return connection.execute("SELECT id, estado FROM public.detections WHERE id = %s AND user_id = %s", (detection, owner)).fetchone()

    def batch(self, owner: UUID, detections: list[DetectionInput]) -> BatchResponse:
        accepted: list[UUID] = []
        existing: list[UUID] = []
        with self.transaction(owner) as connection:
            for row in detections:
                inserted = connection.execute(
                    """INSERT INTO public.detections (id,user_id,especie,confianza,estado,momento,ubicacion,version_modelo)
                    VALUES (%s,%s,%s,%s,%s,%s,ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography,%s)
                    ON CONFLICT (id) DO NOTHING RETURNING id""",
                    (row.id, owner, row.species, row.confidence, "confirmada" if row.status == "confirmed" else "provisional", row.recorded_at, row.location.longitude, row.location.latitude, row.model_version),
                ).fetchone()
                owned = connection.execute("SELECT id, especie, version_modelo, ruta_audio FROM public.detections WHERE id=%s AND user_id=%s", (row.id, owner)).fetchone()
                if not owned or owned["especie"] != row.species or owned["version_modelo"] != row.model_version:
                    raise HTTPException(409, "Detection identifier conflict")
                if row.audio_path:
                    if owned["ruta_audio"] not in (None, row.audio_path):
                        raise HTTPException(409, "Audio identifier conflict")
                    connection.execute("UPDATE public.detections SET ruta_audio=%s WHERE id=%s AND user_id=%s", (row.audio_path, row.id, owner))
                    connection.execute("INSERT INTO public.verification_jobs(detection_id) VALUES (%s) ON CONFLICT (detection_id) DO NOTHING", (row.id,))
                (accepted if inserted else existing).append(row.id)
        return BatchResponse(accepted_ids=accepted, existing_ids=existing)
