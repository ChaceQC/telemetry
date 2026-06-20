from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EventQueryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    type: str
    source: str | None
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime
