
"""
MedTwin AI - Chat API

Handles:
- Patient/caregiver conversation
- Safe history-taking responses
- Session-aware chat logging
- ElevenLabs voice generation

Clinical exams, investigations, imaging and diagnosis
remain outside patient chat.
"""

from time import perf_counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import base64
import logging

from fastapi import APIRouter, HTTPException

from ..models.schemas import ChatRequest, ChatResponse
from ..services.blueprint_loader import load_case

from ..services.field_registry import (
    build_registry,
    CaseFieldRegistry,
    FieldDomain,
)

from ..services.intent_router import classify, MessageIntent
from ..services.semantic_matcher import match_fields
from ..services.retriever import retrieve_fields

from ..services.answer_composer import (
    compose_casual_reply,
    compose_patient_answer,
)

from ..services.voice_service import generate_voice
from ..services.arabic_speech_normalizer import (
    normalize_egyptian_speech,
)

from .case_tools import (
    _get_session,
    _assert_session_case,
    _assert_active_session,
    _record_session_event,
)


router = APIRouter()
logger = logging.getLogger(__name__)

_blueprint_cache: dict = {}
_registry_cache: dict[str, CaseFieldRegistry] = {}


# ============================================================
# CASE HELPERS
# ============================================================

def _get_blueprint(case_id: str):
    if case_id not in _blueprint_cache:
        try:
            _blueprint_cache[case_id] = load_case(case_id)
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown case_id: {case_id}",
            )

    return _blueprint_cache[case_id]


def _get_registry(
    case_id: str,
    blueprint,
) -> CaseFieldRegistry:

    if case_id not in _registry_cache:
        _registry_cache[case_id] = build_registry(
            blueprint
        )

    return _registry_cache[case_id]


# ============================================================
# SESSION LOGGING
# ============================================================

def _validate_chat_session(request: ChatRequest):
    """
    Validate the session before generating a reply.

    session_id is temporarily optional for backward
    compatibility with the existing frontend.
    """

    if not request.session_id:
        return None

    session = _get_session(request.session_id)

    _assert_session_case(session, request.case_id)
    _assert_active_session(session)

    return session


def _save_chat_exchange(
    session: dict | None,
    student_message: str,
    patient_reply: str,
):
    """
    Save one successful question-answer exchange.

    No audio, API keys, or hidden ground truth is stored.
    """

    if session is None:
        return

    # Do not log against a completed session.
    _assert_active_session(session)

    now = datetime.now(timezone.utc).isoformat()

    session["chat_history"].append({
        "role": "student",
        "content": student_message,
        "timestamp": now,
    })

    _record_session_event(
        session,
        "student_message",
        message=student_message,
    )

    session["chat_history"].append({
        "role": "patient",
        "content": patient_reply,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    _record_session_event(
        session,
        "patient_reply",
        message=patient_reply,
    )


# ============================================================
# REDIRECT RESPONSES
# ============================================================

def _physical_exam_redirect() -> str:
    return (
        "حضرتك تقدر تعمل الفحص من قسم "
        "Physical Examination يا دكتور."
    )


def _investigation_redirect() -> str:
    return (
        "التحاليل والنتائج تقدر تطلع عليها "
        "من قسم Investigations يا دكتور."
    )


def _imaging_redirect() -> str:
    return "الأشعة متاحة في قسم Imaging يا دكتور."


def _clinical_decision_reply() -> str:
    return (
        "مش عارفة يا دكتور، "
        "حضرتك أدرى بالتشخيص والحالة."
    )


def _out_of_scope_reply() -> str:
    return "مش عارفة يا دكتور، خلّينا في حالة بنتي."


# ============================================================
# SAFE CHAT DOMAINS
# ============================================================

CHAT_ALLOWED_DOMAINS = {
    FieldDomain.CHIEF_COMPLAINT,
    FieldDomain.PATIENT,
    FieldDomain.HISTORY,
}


# ============================================================
# CLINICAL RESPONSE GENERATION
# ============================================================

def _generate_clinical_reply(
    request: ChatRequest,
) -> str:
    """
    Generate a clinically grounded patient reply.

    This function does not log messages.
    """

    blueprint = _get_blueprint(request.case_id)

    registry = _get_registry(
        request.case_id,
        blueprint,
    )

    # Intent classification and semantic matching
    with ThreadPoolExecutor(max_workers=2) as executor:

        intent_future = executor.submit(
            classify,
            request.message,
        )

        matcher_future = executor.submit(
            match_fields,
            request.message,
            registry,
        )

        routing = intent_future.result()
        matched_paths = matcher_future.result()

    # Casual conversation
    if routing.intent == MessageIntent.CASUAL:
        return compose_casual_reply(
            request.message,
            blueprint,
        )

    # Redirect structured clinical actions
    if routing.intent == MessageIntent.EXAMINATION:
        return _physical_exam_redirect()

    if routing.intent == MessageIntent.LAB_REQUEST:
        return _investigation_redirect()

    if routing.intent == MessageIntent.IMAGING_REQUEST:
        return _imaging_redirect()

    if routing.intent == MessageIntent.CLINICAL_DECISION:
        return _clinical_decision_reply()

    if routing.intent == MessageIntent.META:
        return _out_of_scope_reply()

    # Semantic matching
    if not matched_paths:
        return _out_of_scope_reply()

    # Safe field filtering
    safe_paths: list[str] = []

    for path in matched_paths:

        field = registry.get_field_def(path)

        if field is None:
            continue

        if field.domain in CHAT_ALLOWED_DOMAINS:
            safe_paths.append(path)

    if not safe_paths:
        return _out_of_scope_reply()

    # Retrieve approved clinical facts
    field_results = retrieve_fields(
        blueprint,
        safe_paths,
        registry,
    )

    # Generate in-character patient response
    return compose_patient_answer(
        request.message,
        field_results,
        blueprint,
    )


# ============================================================
# TEXT CHAT API
# ============================================================

@router.post(
    "/api/chat",
    response_model=ChatResponse,
)
def chat(request: ChatRequest) -> ChatResponse:

    # Validate session before AI execution
    session = _validate_chat_session(request)

    # Generate response
    reply = _generate_clinical_reply(request)

    # Record successful exchange exactly once
    _save_chat_exchange(
        session,
        request.message,
        reply,
    )

    return ChatResponse(reply=reply)


# ============================================================
# VOICE CHAT API
# ============================================================

@router.post("/api/chat/voice")
def chat_voice(request: ChatRequest):

    start = perf_counter()

    # Reuse text chat logic.
    # This also logs the conversation exactly once.
    response = chat(request)

    t1 = perf_counter()

    # Arabic pronunciation normalization
    try:
        tts_text = normalize_egyptian_speech(
            response.reply
        )

    except Exception:
        logger.exception(
            "Arabic speech normalization failed"
        )
        tts_text = response.reply

    t2 = perf_counter()

    # ElevenLabs voice generation
    try:
        audio_bytes = generate_voice(tts_text)

        t3 = perf_counter()

        if not audio_bytes:
            raise RuntimeError(
                "ElevenLabs returned empty audio."
            )

        print(
            "\n========== MEDTWIN PERFORMANCE ==========\n"
            f"Clinical AI:    {t1 - start:.2f}s\n"
            f"Normalization:  {t2 - t1:.2f}s\n"
            f"ElevenLabs:     {t3 - t2:.2f}s\n"
            f"TOTAL:          {t3 - start:.2f}s\n"
            "==========================================\n",
            flush=True,
        )

        return {
            "reply": response.reply,
            "tts_text": tts_text,
            "audio_base64": base64.b64encode(
                audio_bytes
            ).decode("ascii"),
            "audio_format": "audio/mpeg",
        }

    except Exception:
        logger.exception(
            "ElevenLabs voice generation failed"
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "ElevenLabs voice generation failed. "
                "Check backend logs."
            ),
        )
