"""
Shared Pydantic models used by the API layer.
"""

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    case_id: str = "PED-RT-0002"
    session_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
