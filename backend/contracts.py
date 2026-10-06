"""Validate every client-controlled value before it reaches PostgreSQL."""
from datetime import datetime
from math import isclose
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Location(StrictModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)

    @field_validator("latitude", "longitude")
    @classmethod
    def require_approximation(cls, value: float) -> float:
        if not isclose(value, round(value, 3), abs_tol=1e-9, rel_tol=0):
            raise ValueError("Location must already be approximate")
        return value


class DetectionInput(StrictModel):
    id: UUID
    species: str = Field(min_length=1, max_length=200)
    confidence: float = Field(ge=0.45, le=1, allow_inf_nan=False)
    status: Literal["confirmed", "provisional"]
    recorded_at: datetime
    location: Location
    model_version: str = Field(min_length=1, max_length=200)
    audio_path: str | None = Field(default=None, max_length=300)

    @field_validator("recorded_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("Timestamp must contain a timezone")
        return value


class BatchInput(StrictModel):
    detections: list[DetectionInput] = Field(min_length=1, max_length=50)


class BatchResponse(StrictModel):
    accepted_ids: list[UUID]
    existing_ids: list[UUID]


class AudioInput(StrictModel):
    content_type: Literal["audio/wav"]
    size_bytes: Literal[288044]
