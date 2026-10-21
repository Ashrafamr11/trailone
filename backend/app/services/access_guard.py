"""
Access Guard
============

Decides HOW information may be released in the simulation.

The semantic matcher determines WHAT the user is asking about.
The access guard determines HOW that information may be accessed.

This keeps the simulated patient behaving like a real human rather than
like a database.

Examples:
- History -> patient/caregiver can usually answer
- Physical exam -> doctor must examine
- Labs/imaging -> available from a report/document
- Unknown/unregistered fields -> blocked
"""

from dataclasses import dataclass
from enum import Enum

from .field_registry import (
    FieldDef,
    KnowledgeMode,
    CaseFieldRegistry,
)


# ---------------------------------------------------------------------------
# ACCESS ACTIONS
# ---------------------------------------------------------------------------

class AccessAction(str, Enum):

    ANSWER_AS_PATIENT = "answer_as_patient"

    ANSWER_AS_PATIENT_IF_REASONABLE = "answer_as_patient_if_reasonable"

    REQUIRE_EXAMINATION = "require_examination"

    SHOW_DOCUMENT = "show_document"

    BLOCK = "block"


# ---------------------------------------------------------------------------
# ACCESS DECISION
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AccessDecision:
    path: str
    action: AccessAction
    field: FieldDef | None

    @property
    def allowed_for_direct_patient_answer(self) -> bool:
        return self.action in {
            AccessAction.ANSWER_AS_PATIENT,
            AccessAction.ANSWER_AS_PATIENT_IF_REASONABLE,
        }


# ---------------------------------------------------------------------------
# SINGLE FIELD DECISION
# ---------------------------------------------------------------------------

def decide_access(
    path: str,
    registry: CaseFieldRegistry,
) -> AccessDecision:
    """
    Decide how one requested field should be handled.

    Unknown or unregistered fields are always blocked.
    """

    field = registry.get_field_def(path)

    if field is None:
        return AccessDecision(
            path=path,
            action=AccessAction.BLOCK,
            field=None,
        )

    if field.knowledge_mode == KnowledgeMode.PATIENT_KNOWS:
        return AccessDecision(
            path=path,
            action=AccessAction.ANSWER_AS_PATIENT,
            field=field,
        )

    if field.knowledge_mode == KnowledgeMode.PATIENT_MAY_KNOW:
        return AccessDecision(
            path=path,
            action=AccessAction.ANSWER_AS_PATIENT_IF_REASONABLE,
            field=field,
        )

    if field.knowledge_mode == KnowledgeMode.DOCTOR_OBSERVES:
        return AccessDecision(
            path=path,
            action=AccessAction.REQUIRE_EXAMINATION,
            field=field,
        )

    if field.knowledge_mode == KnowledgeMode.DOCUMENT_ONLY:
        return AccessDecision(
            path=path,
            action=AccessAction.SHOW_DOCUMENT,
            field=field,
        )

    return AccessDecision(
        path=path,
        action=AccessAction.BLOCK,
        field=field,
    )


# ---------------------------------------------------------------------------
# MULTIPLE FIELD DECISIONS
# ---------------------------------------------------------------------------

def decide_access_for_fields(
    paths: list[str],
    registry: CaseFieldRegistry,
) -> list[AccessDecision]:
    """
    Apply access rules to multiple requested fields.

    Duplicate paths are removed while preserving order.
    """

    decisions: list[AccessDecision] = []
    seen: set[str] = set()

    for path in paths:

        if path in seen:
            continue

        seen.add(path)

        decisions.append(
            decide_access(
                path,
                registry,
            )
        )

    return decisions


# ---------------------------------------------------------------------------
# GROUP HELPERS
# ---------------------------------------------------------------------------

def patient_answerable_paths(
    decisions: list[AccessDecision],
) -> list[str]:

    return [
        decision.path
        for decision in decisions
        if decision.allowed_for_direct_patient_answer
    ]


def examination_paths(
    decisions: list[AccessDecision],
) -> list[str]:

    return [
        decision.path
        for decision in decisions
        if decision.action == AccessAction.REQUIRE_EXAMINATION
    ]


def document_paths(
    decisions: list[AccessDecision],
) -> list[str]:

    return [
        decision.path
        for decision in decisions
        if decision.action == AccessAction.SHOW_DOCUMENT
    ]


def blocked_paths(
    decisions: list[AccessDecision],
) -> list[str]:

    return [
        decision.path
        for decision in decisions
        if decision.action == AccessAction.BLOCK
    ]
