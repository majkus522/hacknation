from typing import Any
from pydantic import BaseModel, Field


class FieldPoint(BaseModel):
    x: float
    y: float


class FieldCreate(BaseModel):
    name: str
    x: float = 0.0
    y: float = 0.0
    points: list[FieldPoint] | list[dict[str, Any]] = Field(
        default_factory=list
    )