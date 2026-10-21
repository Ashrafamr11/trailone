"""
Retriever
=========

This module is the final safe bridge between:

    approved Blueprint field paths
            ↓
    actual verified values

IMPORTANT SECURITY RULE:

A path that is not present in the CURRENT CASE registry is NEVER read from
the Blueprint, even if that path technically exists in the JSON.

The Retriever does NOT decide:
- what the user meant
- whether the patient should know something
- whether information comes from examination or documents

Those responsibilities belong to:
    semantic_matcher.py
    access_guard.py

The Retriever only performs safe, exact Blueprint lookups.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .blueprint_loader import Blueprint
from .field_registry import CaseFieldRegistry


# ---------------------------------------------------------------------------
# FIELD STATUS
# ---------------------------------------------------------------------------

class FieldStatus(str, Enum):
    DOCUMENTED = "documented"
    NOT_DOCUMENTED = "not_documented"
    INVALID_PATH = "invalid_path"


# ---------------------------------------------------------------------------
# FIELD RESULT
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class FieldResult:
    path: str
    status: FieldStatus
    value: Optional[object] = None

    @property
    def is_available(self) -> bool:
        return self.status == FieldStatus.DOCUMENTED

    def to_fact_dict_entry(self) -> dict:
        """
        Minimal safe representation passed to the answer composer.
        """

        if self.is_available:
            return {
                "path": self.path,
                "value": self.value,
            }

        return {
            "path": self.path,
            "value": "NOT_DOCUMENTED",
        }


# ---------------------------------------------------------------------------
# SAFE RETRIEVAL
# ---------------------------------------------------------------------------

def retrieve_fields(
    blueprint: Blueprint,
    requested_paths: list[str],
    registry: CaseFieldRegistry,
) -> list[FieldResult]:
    """
    Retrieve verified values using the CURRENT CASE registry.

    Safety behavior:
    1. Duplicate paths are ignored.
    2. Paths not registered for this case are never looked up.
    3. Missing paths become NOT_DOCUMENTED.
    4. null values become NOT_DOCUMENTED.
    5. Only exact Blueprint values are returned.
    """

    results: list[FieldResult] = []
    seen: set[str] = set()

    for path in requested_paths:

        if path in seen:
            continue

        seen.add(path)

        # ---------------------------------------------------------------
        # CURRENT-CASE SECURITY GATE
        # ---------------------------------------------------------------

        if not registry.is_valid_path(path):
            results.append(
                FieldResult(
                    path=path,
                    status=FieldStatus.INVALID_PATH,
                )
            )
            continue

        # ---------------------------------------------------------------
        # EXACT BLUEPRINT LOOKUP
        # ---------------------------------------------------------------

        try:
            value = blueprint.get_path(path)

        except KeyError:
            results.append(
                FieldResult(
                    path=path,
                    status=FieldStatus.NOT_DOCUMENTED,
                )
            )
            continue

        # ---------------------------------------------------------------
        # NULL HANDLING
        # ---------------------------------------------------------------

        if value is None:
            results.append(
                FieldResult(
                    path=path,
                    status=FieldStatus.NOT_DOCUMENTED,
                )
            )
            continue

        # ---------------------------------------------------------------
        # VERIFIED VALUE
        # ---------------------------------------------------------------

        results.append(
            FieldResult(
                path=path,
                status=FieldStatus.DOCUMENTED,
                value=value,
            )
        )

    return results


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def all_not_documented(
    results: list[FieldResult],
) -> bool:
    """
    True when no requested field contains an available value.
    """

    if not results:
        return True

    return all(
        not result.is_available
        for result in results
    )
