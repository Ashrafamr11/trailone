"""
Dynamic Field Registry
======================

Builds a SAFE field registry for each individual Blueprint.

IMPORTANT:
We DO NOT recursively walk the Blueprint JSON.

Instead, we only trust paths explicitly declared inside:

    blueprint["field_descriptions"]

AND only when they belong to an allow-listed clinical section.

This allows completely different medical cases to work without changing
Python code, while keeping hidden/private Blueprint sections inaccessible.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Any


# ---------------------------------------------------------------------------
# KNOWLEDGE MODES
# ---------------------------------------------------------------------------

class KnowledgeMode(str, Enum):
    """
    Describes how the information is naturally obtained.
    """

    PATIENT_KNOWS = "patient_knows"
    PATIENT_MAY_KNOW = "patient_may_know"
    DOCTOR_OBSERVES = "doctor_observes"
    DOCUMENT_ONLY = "document_only"


# ---------------------------------------------------------------------------
# DOMAINS
# ---------------------------------------------------------------------------

class FieldDomain(str, Enum):
    CHIEF_COMPLAINT = "chief_complaint"
    PATIENT = "patient"
    HISTORY = "history"
    PHYSICAL_EXAM = "physical_exam"
    LABORATORY = "laboratory"
    CLINICAL_SCORE = "clinical_score"
    IMAGING = "imaging"


# ---------------------------------------------------------------------------
# FIELD MODEL
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class FieldDef:
    path: str
    description: str
    domain: FieldDomain
    knowledge_mode: KnowledgeMode
    group: Optional[str] = None


# ---------------------------------------------------------------------------
# SAFE SECTIONS
# ---------------------------------------------------------------------------

SAFE_ROOTS = {
    "patient",
    "history",
    "physical_exam",
    "laboratory_investigations",
    "clinical_scores",
    "imaging",
}


# simulation as a whole is NOT safe.
# We explicitly allow only this one patient-facing field.
SAFE_SPECIAL_PATHS = {
    "simulation.opening.patient_line",
    "simulation.respondent.role",
    "simulation.respondent.relationship_to_patient",
    "simulation.respondent.speaks_for_patient",
    "simulation.respondent.reason",
}


# Never expose anything from these sections.
BLOCKED_ROOTS = {
    "ground_truth",
    "source_raw_fields",
    "source",
    "simulation_flow",
    "data_quality",
}


# ---------------------------------------------------------------------------
# DOMAIN / KNOWLEDGE RULES
# ---------------------------------------------------------------------------

def _metadata_for_path(
    path: str,
) -> tuple[FieldDomain, KnowledgeMode, str]:
    """
    Assign generic metadata based on the path's clinical section.

    These are domain-level rules, not disease-specific rules.
    """

    if path == "simulation.opening.patient_line":
        return (
            FieldDomain.CHIEF_COMPLAINT,
            KnowledgeMode.PATIENT_KNOWS,
            "chief_complaint",
        )

    root = path.split(".", 1)[0]

    if root == "patient":
        return (
            FieldDomain.PATIENT,
            KnowledgeMode.PATIENT_KNOWS,
            "demographics",
        )

    if root == "history":
        return (
            FieldDomain.HISTORY,
            KnowledgeMode.PATIENT_KNOWS,
            "history",
        )

    if root == "physical_exam":
        return (
            FieldDomain.PHYSICAL_EXAM,
            KnowledgeMode.DOCTOR_OBSERVES,
            "physical_exam",
        )

    if root == "laboratory_investigations":
        return (
            FieldDomain.LABORATORY,
            KnowledgeMode.DOCUMENT_ONLY,
            "laboratory",
        )

    if root == "clinical_scores":
        return (
            FieldDomain.CLINICAL_SCORE,
            KnowledgeMode.DOCUMENT_ONLY,
            "clinical_scores",
        )

    if root == "imaging":
        # Give imaging a slightly more specific group when possible.
        #
        # imaging.xray.findings.Result
        # -> xray
        #
        # imaging.ultrasound.findings.Appendix_Diameter
        # -> ultrasound

        parts = path.split(".")

        imaging_type = (
            parts[1]
            if len(parts) > 1
            else "imaging"
        )

        return (
            FieldDomain.IMAGING,
            KnowledgeMode.DOCUMENT_ONLY,
            imaging_type,
        )

    raise ValueError(
        f"Unsupported safe field path: {path}"
    )


# ---------------------------------------------------------------------------
# PATH SAFETY
# ---------------------------------------------------------------------------

def is_safe_declared_path(path: str) -> bool:
    """
    Check whether a declared field path belongs to an allowed clinical area.

    This does NOT check whether the path exists in a particular Blueprint.
    """

    if not path or not isinstance(path, str):
        return False

    if path in SAFE_SPECIAL_PATHS:
        return True

    root = path.split(".", 1)[0]

    if root in BLOCKED_ROOTS:
        return False

    return root in SAFE_ROOTS


# ---------------------------------------------------------------------------
# DYNAMIC REGISTRY
# ---------------------------------------------------------------------------

class CaseFieldRegistry:
    """
    Safe field registry built specifically for one Blueprint.
    """

    def __init__(
        self,
        fields: list[FieldDef],
    ):
        self.fields = fields

        self._field_map: dict[str, FieldDef] = {
            field.path: field
            for field in fields
        }

        self._path_set: set[str] = set(
            self._field_map.keys()
        )

    def is_valid_path(self, path: str) -> bool:
        return path in self._path_set

    def get_field_def(
        self,
        path: str,
    ) -> Optional[FieldDef]:
        return self._field_map.get(path)

    def fields_for_domain(
        self,
        domain: FieldDomain,
    ) -> list[FieldDef]:

        return [
            field
            for field in self.fields
            if field.domain == domain
        ]

    def fields_for_group(
        self,
        group: str,
    ) -> list[FieldDef]:

        return [
            field
            for field in self.fields
            if field.group == group
        ]

    def available_groups(self) -> list[str]:
        return sorted({
            field.group
            for field in self.fields
            if field.group
        })

    def menu_text(self) -> str:
        """
        Rich semantic menu for the semantic matcher.
        """

        lines: list[str] = []

        for field in self.fields:
            lines.append(
                (
                    f"- path: {field.path}\n"
                    f"  description: {field.description}\n"
                    f"  domain: {field.domain.value}\n"
                    f"  knowledge: {field.knowledge_mode.value}\n"
                    f"  group: {field.group or 'none'}"
                )
            )

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# BLUEPRINT HELPERS
# ---------------------------------------------------------------------------

def _path_exists(
    data: dict,
    path: str,
) -> bool:
    """
    Check that the declared path actually exists in the Blueprint.

    A null value still counts as an existing path.
    """

    node: Any = data

    for part in path.split("."):
        if not isinstance(node, dict):
            return False

        if part not in node:
            return False

        node = node[part]

    return True


# ---------------------------------------------------------------------------
# REGISTRY BUILDER
# ---------------------------------------------------------------------------

def build_registry(
    blueprint,
) -> CaseFieldRegistry:
    """
    Build a safe registry for ONE Blueprint.

    Requirements for a field to become accessible:

    1. It must appear explicitly in field_descriptions.
    2. Its path must belong to an approved clinical section.
    3. The actual path must exist in the Blueprint.

    Therefore fields cannot become accessible merely because they exist
    somewhere in raw JSON.
    """

    data = blueprint.data

    descriptions = data.get(
        "field_descriptions",
        {},
    )

    if not isinstance(descriptions, dict):
        descriptions = {}

    fields: list[FieldDef] = []

    for path, description in descriptions.items():

        # ---------------------------------------------------------------
        # VALID BASIC FORMAT
        # ---------------------------------------------------------------

        if not isinstance(path, str):
            continue

        if not isinstance(description, str):
            continue

        # ---------------------------------------------------------------
        # SECURITY GATE
        # ---------------------------------------------------------------

        if not is_safe_declared_path(path):
            continue

        # ---------------------------------------------------------------
        # VERIFY IT REALLY EXISTS
        # ---------------------------------------------------------------

        if not _path_exists(data, path):
            continue

        # ---------------------------------------------------------------
        # GENERIC METADATA
        # ---------------------------------------------------------------

        try:
            domain, knowledge_mode, group = _metadata_for_path(
                path
            )

        except ValueError:
            continue

        fields.append(
            FieldDef(
                path=path,
                description=description,
                domain=domain,
                knowledge_mode=knowledge_mode,
                group=group,
            )
        )

    return CaseFieldRegistry(fields)
