
"""
MedTwin AI - Case Tools API

Case catalog, clinical tools, session lifecycle,
diagnosis submission, and session activity logging.
"""

from uuid import uuid4
from typing import Any
from datetime import datetime, timezone
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.blueprint_loader import load_case
from ..services.evaluation_service import evaluate_session


router = APIRouter()

_blueprint_cache: dict = {}
_sessions: dict[str, dict] = {}


# ============================================================
# HELPERS
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


def _safe_get(blueprint, path: str, default=None):
    try:
        value = blueprint.get_path(path)
        return default if value is None else value
    except (KeyError, TypeError):
        return default


def _get_session(session_id: str) -> dict:
    session = _sessions.get(session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Unknown session_id",
        )

    return session


def _assert_session_case(session: dict, case_id: str):
    if session["case_id"] != case_id:
        raise HTTPException(
            status_code=400,
            detail="Session does not belong to this case",
        )


def _assert_active_session(session: dict):
    if session["status"] != "active":
        raise HTTPException(
            status_code=409,
            detail="Session has already ended",
        )


def _record_session_event(
    session: dict,
    event_type: str,
    **details: Any,
):
    timeline = session.setdefault("action_timeline", [])

    timeline.append({
        "sequence": len(timeline) + 1,
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(),
        "event_type": event_type,
        **details,
    })


def _format_value(value: Any) -> Any:
    if isinstance(value, dict) and "value" in value:
        return {
            "value": value.get("value"),
            "unit": value.get("unit"),
        }

    return value


def _public_case_summary(blueprint) -> dict:
    presentation = blueprint.data.get("presentation", {})
    patient = blueprint.data.get("patient", {})

    return {
        "case_id": blueprint.case_id,
        "title": presentation.get(
            "title", "Clinical Case"
        ),
        "subtitle": presentation.get("subtitle"),
        "short_brief": presentation.get("short_brief"),
        "difficulty": presentation.get("difficulty"),
        "specialty": presentation.get("specialty"),
        "setting": presentation.get("setting"),
        "estimated_duration_minutes": presentation.get(
            "estimated_duration_minutes"
        ),
        "thumbnail": presentation.get("thumbnail"),
        "patient": {
            "age": patient.get("Age"),
            "sex": patient.get("Sex"),
        },
    }


# ============================================================
# REQUEST MODELS
# ============================================================

class SessionRequest(BaseModel):
    case_id: str


class ToolRequest(BaseModel):
    session_id: str
    item_ids: list[str]


class EndSessionRequest(BaseModel):
    session_id: str


class DiagnosisRequest(BaseModel):
    session_id: str
    option_id: str
    justification: str = Field(
        default="",
        max_length=5000,
    )


# ============================================================
# CASE CATALOG
# ============================================================

@router.get("/api/cases")
def list_cases():
    case_ids = ["PED-RT-0002"]
    cases = []

    for case_id in case_ids:
        try:
            blueprint = _get_blueprint(case_id)
        except HTTPException:
            continue

        cases.append(_public_case_summary(blueprint))

    return {"cases": cases}


@router.get("/api/cases/{case_id}")
def get_case_details(case_id: str):
    blueprint = _get_blueprint(case_id)

    return {
        **_public_case_summary(blueprint),
        "respondent": _safe_get(
            blueprint,
            "simulation.respondent.role",
            "caregiver",
        ),
        "opening_available": True,
        "tools": {
            "physical_exam": True,
            "investigations": True,
            "imaging": True,
        },
    }


# ============================================================
# START SESSION
# ============================================================

@router.post("/api/sessions/start")
def start_session(request: SessionRequest):
    blueprint = _get_blueprint(request.case_id)
    session_id = str(uuid4())

    session = {
        "session_id": session_id,
        "case_id": blueprint.case_id,
        "status": "active",
        "started_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "chat_history": [],
        "action_timeline": [],
        "exam_items_opened": [],
        "investigations_opened": [],
        "imaging_opened": [],
        "diagnosis_submitted": False,
        "selected_diagnosis": None,
        "diagnosis_correct": None,
        "diagnosis_justification": None,
        "diagnosis_assessment": None,
    }

    _sessions[session_id] = session

    _record_session_event(
        session,
        "session_started",
    )

    return {
        "session_id": session_id,
        "case_id": blueprint.case_id,
        "status": "active",
    }


# ============================================================
# PHYSICAL EXAMINATION
# ============================================================

@router.get("/api/cases/{case_id}/physical-exam")
def get_physical_exam_menu(case_id: str):
    blueprint = _get_blueprint(case_id)

    config = blueprint.data.get(
        "physical_exam_ui", {}
    )

    return {
        "title": config.get(
            "title", "Physical Examination"
        ),
        "instruction": config.get("instruction"),
        "items": [
            {
                "id": item.get("id"),
                "label": item.get("label"),
            }
            for item in config.get("items", [])
        ],
    }


@router.post("/api/cases/{case_id}/physical-exam")
def perform_physical_exam(
    case_id: str,
    request: ToolRequest,
):
    blueprint = _get_blueprint(case_id)
    session = _get_session(request.session_id)

    _assert_session_case(session, case_id)
    _assert_active_session(session)

    config = blueprint.data.get(
        "physical_exam_ui", {}
    )

    available = {
        item.get("id"): item
        for item in config.get("items", [])
    }

    results = []

    for item_id in request.item_ids:
        item = available.get(item_id)

        if item is None:
            continue

        value = _safe_get(
            blueprint, item.get("path")
        )

        results.append({
            "id": item_id,
            "label": item.get("label"),
            "result": (
                _format_value(value)
                if value is not None
                else "Not documented"
            ),
        })

        if item_id not in session["exam_items_opened"]:
            session["exam_items_opened"].append(item_id)

    if results:
        _record_session_event(
            session,
            "physical_exam_performed",
            item_ids=[r["id"] for r in results],
        )

    return {"results": results}


# ============================================================
# INVESTIGATIONS
# ============================================================

@router.get("/api/cases/{case_id}/investigations")
def get_investigations_menu(case_id: str):
    blueprint = _get_blueprint(case_id)
    config = blueprint.data.get(
        "investigations_ui", {}
    )

    groups = []

    for group in config.get("groups", []):
        items = []

        for index, item in enumerate(
            group.get("items", [])
        ):
            items.append({
                "id": f"{group.get('id')}_{index}",
                "label": item.get("label"),
            })

        groups.append({
            "id": group.get("id"),
            "label": group.get("label"),
            "items": items,
        })

    return {
        "title": config.get(
            "title", "Investigations"
        ),
        "instruction": config.get("instruction"),
        "groups": groups,
    }


@router.post("/api/cases/{case_id}/investigations")
def get_investigation_results(
    case_id: str,
    request: ToolRequest,
):
    blueprint = _get_blueprint(case_id)
    session = _get_session(request.session_id)

    _assert_session_case(session, case_id)
    _assert_active_session(session)

    config = blueprint.data.get(
        "investigations_ui", {}
    )

    available = {}

    for group in config.get("groups", []):
        for index, item in enumerate(
            group.get("items", [])
        ):
            item_id = f"{group.get('id')}_{index}"

            available[item_id] = {
                **item,
                "group_label": group.get("label"),
            }

    results = []

    for item_id in request.item_ids:
        item = available.get(item_id)

        if item is None:
            continue

        value = _safe_get(
            blueprint, item.get("path")
        )

        results.append({
            "id": item_id,
            "group": item.get("group_label"),
            "label": item.get("label"),
            "result": (
                value if value is not None
                else "Not documented"
            ),
        })

        if item_id not in session["investigations_opened"]:
            session["investigations_opened"].append(item_id)

    if results:
        _record_session_event(
            session,
            "investigations_requested",
            item_ids=[r["id"] for r in results],
        )

    return {"results": results}


# ============================================================
# IMAGING
# ============================================================

@router.get("/api/cases/{case_id}/imaging")
def get_imaging_menu(case_id: str):
    blueprint = _get_blueprint(case_id)
    config = blueprint.data.get(
        "imaging_ui", {}
    )

    return {
        "title": config.get("title", "Imaging"),
        "instruction": config.get("instruction"),
        "studies": [
            {
                "id": study.get("id"),
                "label": study.get("label"),
                "type": study.get("type"),
            }
            for study in config.get("studies", [])
        ],
    }


@router.post("/api/cases/{case_id}/imaging")
def get_imaging_result(
    case_id: str,
    request: ToolRequest,
):
    blueprint = _get_blueprint(case_id)
    session = _get_session(request.session_id)

    _assert_session_case(session, case_id)
    _assert_active_session(session)

    config = blueprint.data.get(
        "imaging_ui", {}
    )

    available = {
        study.get("id"): study
        for study in config.get("studies", [])
    }

    results = []

    for study_id in request.item_ids:
        study = available.get(study_id)

        if study is None:
            continue

        image_path = _safe_get(
            blueprint, study.get("image_path")
        )

        report = _safe_get(
            blueprint, study.get("report_path")
        )

        results.append({
            "id": study_id,
            "label": study.get("label"),
            "type": study.get("type"),
            "image": image_path,
            "report": (
                report if report is not None
                else config.get(
                    "missing_report_text",
                    "Written report not available.",
                )
            ),
        })

        if study_id not in session["imaging_opened"]:
            session["imaging_opened"].append(study_id)

    if results:
        _record_session_event(
            session,
            "imaging_viewed",
            item_ids=[r["id"] for r in results],
        )

    return {"results": results}


# ============================================================
# END SESSION
# ============================================================

@router.post("/api/cases/{case_id}/end-session")
def end_session_v2(
    case_id: str,
    request: EndSessionRequest,
):
    blueprint = _get_blueprint(case_id)
    session = _get_session(request.session_id)

    _assert_session_case(session, case_id)
    _assert_active_session(session)

    session["status"] = "awaiting_final_diagnosis"

    _record_session_event(
        session, "session_ended"
    )

    assessment = blueprint.data.get(
        "learner_assessment", {}
    )

    final_diagnosis = assessment.get(
        "final_diagnosis", {}
    )

    # Return learner-visible options only.
    return {
        "status": session["status"],
        "assessment": {
            "title": final_diagnosis.get("title"),
            "instruction": final_diagnosis.get(
                "instruction"
            ),
            "type": final_diagnosis.get(
                "type", "single_choice"
            ),
            "options": final_diagnosis.get(
                "options", []
            ),
        },
    }


# ============================================================
# DIAGNOSIS ASSESSMENT
# ============================================================

def _assess_diagnosis(
    blueprint,
    option_id: str,
    justification: str,
) -> dict:
    """
    Conservative rule-based classification.

    This does NOT award numeric marks or claim that
    a diagnosis is medically validated.
    """

    ground_truth = _safe_get(
        blueprint,
        "ground_truth.final_diagnosis",
        {},
    )

    diagnostic_config = ground_truth.get(
        "diagnostic_assessment", {}
    )

    primary = diagnostic_config.get("primary", {})

    primary_id = primary.get(
        "option_id",
        ground_truth.get("option_id"),
    )

    alternatives = diagnostic_config.get(
        "alternatives", []
    )

    less_supported = diagnostic_config.get(
        "less_supported_options", []
    )

    rationale = justification.strip()

    if option_id == primary_id:
        return {
            "status": "correct",
            "classification": "primary",
            "requires_review": False,
            "reason": (
                "The selected diagnosis matches the "
                "documented primary diagnosis."
            ),
            "evidence_for": primary.get("evidence", []),
            "evidence_against": [],
            "justification_provided": bool(rationale),
        }

    for alternative in alternatives:
        if alternative.get("option_id") == option_id:
            return {
                "status": "needs_review",
                "classification": alternative.get(
                    "classification",
                    "reasonable_differential",
                ),
                "requires_review": True,
                "reason": (
                    "This is a documented clinical "
                    "differential or possible coexisting "
                    "condition. Its acceptability as the "
                    "final diagnosis requires review of "
                    "the student's justification and "
                    "case evidence."
                ),
                "evidence_for": alternative.get(
                    "evidence_for", []
                ),
                "evidence_against": alternative.get(
                    "evidence_against_as_sole_diagnosis",
                    [],
                ),
                "justification_provided": bool(rationale),
            }

    if option_id in less_supported:
        reason = (
            "This option is less supported by the "
            "documented clinical findings."
        )
    else:
        reason = (
            "The selected option is not listed among "
            "the accepted or reviewable diagnoses."
        )

    return {
        "status": "incorrect",
        "classification": "less_supported",
        "requires_review": False,
        "reason": reason,
        "evidence_for": [],
        "evidence_against": [],
        "justification_provided": bool(rationale),
    }


# ============================================================
# SUBMIT FINAL DIAGNOSIS
# ============================================================

@router.post("/api/cases/{case_id}/submit-diagnosis")
def submit_diagnosis(
    case_id: str,
    request: DiagnosisRequest,
):
    blueprint = _get_blueprint(case_id)
    session = _get_session(request.session_id)

    _assert_session_case(session, case_id)

    if session["status"] != "awaiting_final_diagnosis":
        raise HTTPException(
            status_code=409,
            detail=(
                "Session must be ended before "
                "diagnosis submission"
            ),
        )

    if session["diagnosis_submitted"]:
        raise HTTPException(
            status_code=409,
            detail="Diagnosis already submitted",
        )

    options = _safe_get(
        blueprint,
        "learner_assessment.final_diagnosis.options",
        [],
    )

    valid_ids = {
        option.get("id")
        for option in options
    }

    if request.option_id not in valid_ids:
        raise HTTPException(
            status_code=400,
            detail="Invalid diagnosis option",
        )

    justification = request.justification.strip()

    # Require an explanation to evaluate reasoning.
    if len(justification) < 20:
        raise HTTPException(
            status_code=422,
            detail=(
                "Please provide at least 20 characters "
                "explaining your clinical reasoning."
            ),
        )

    assessment = _assess_diagnosis(
        blueprint,
        request.option_id,
        justification,
    )

    is_correct = assessment["status"] == "correct"

    session["diagnosis_submitted"] = True
    session["selected_diagnosis"] = request.option_id
    session["diagnosis_correct"] = is_correct
    session["diagnosis_justification"] = justification
    session["diagnosis_assessment"] = assessment
    session["status"] = "completed"

    _record_session_event(
        session,
        "diagnosis_submitted",
        option_id=request.option_id,
        justification=justification,
        assessment_status=assessment["status"],
    )

    correct_id = _safe_get(
        blueprint,
        "ground_truth.final_diagnosis.option_id",
    )

    correct_label = _safe_get(
        blueprint,
        "ground_truth.final_diagnosis.label",
    )

    return {
        # Kept for compatibility with older frontend.
        "correct": is_correct,

        # New structured diagnosis assessment.
        "diagnosis_assessment": assessment,
        "selected_option_id": request.option_id,
        "student_justification": justification,

        "correct_diagnosis": {
            "option_id": correct_id,
            "label": correct_label,
        },

        "secondary_findings": _safe_get(
            blueprint,
            "ground_truth.secondary_findings",
            [],
        ),

        "debrief": _safe_get(
            blueprint,
            "ground_truth.debrief",
            {},
        ),

        "status": "completed",
    }


# ============================================================
# DEVELOPMENT-ONLY SESSION LOG INSPECTION
# ============================================================

@router.get("/api/debug/sessions/{session_id}")
def debug_session_log(session_id: str):
    """
    Development-only endpoint.
    Never enable on a public deployment.
    """

    if os.getenv(
        "DEBUG_SESSION_LOGS", "false"
    ).lower() != "true":
        raise HTTPException(
            status_code=404,
            detail="Not found",
        )

    session = _get_session(session_id)

    return {
        "session_id": session["session_id"],
        "case_id": session["case_id"],
        "status": session["status"],
        "chat_history": session.get(
            "chat_history", []
        ),
        "action_timeline": session.get(
            "action_timeline", []
        ),
        "exam_items_opened": session.get(
            "exam_items_opened", []
        ),
        "investigations_opened": session.get(
            "investigations_opened", []
        ),
        "imaging_opened": session.get(
            "imaging_opened", []
        ),
        "selected_diagnosis": session.get(
            "selected_diagnosis"
        ),
        "diagnosis_justification": session.get(
            "diagnosis_justification"
        ),
        "diagnosis_assessment": session.get(
            "diagnosis_assessment"
        ),
    }


# ============================================================
# DEVELOPMENT-ONLY REAL SESSION EVALUATION
# ============================================================

@router.get("/api/sessions/{session_id}/evaluation")
def get_session_evaluation(session_id: str):
    """
    Local demo endpoint for evaluating a completed session.

    Disabled by default because sessions have no authentication.
    Do not enable this on a publicly accessible server.
    """
    if os.getenv("DEBUG_SESSION_LOGS", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")

    session = _get_session(session_id)
    if session.get("status") != "completed":
        raise HTTPException(
            status_code=409,
            detail="Complete the session and submit a diagnosis first",
        )

    try:
        if session.get("evaluation_report") is None:
            session["evaluation_report"] = evaluate_session(session)
        return session["evaluation_report"]
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Evaluation configuration error: {exc}",
        ) from exc
