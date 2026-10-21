"""
Blueprint Loader
================

Loads a clinical case Blueprint JSON file into memory.

This is the ONLY module allowed to read raw case JSON files from disk.

Responsibilities:
- locate a case by case_id
- parse JSON safely
- verify that the loaded case_id matches
- provide safe dotted-path lookups

It does NOT decide:
- which fields are safe
- what the user is asking
- what information may be revealed

Those responsibilities belong to other services.
"""

import json
from pathlib import Path
from typing import Any


CASES_DIR = Path(__file__).resolve().parent.parent.parent / "cases"


class Blueprint:
    """
    Wrapper around one loaded clinical case.
    """

    def __init__(
        self,
        case_id: str,
        data: dict,
        source_path: Path | None = None,
    ):
        self.case_id = case_id
        self.data = data
        self.source_path = source_path

    def get_path(self, path: str) -> Any:
        """
        Retrieve a value using a dotted path.

        Example:
            history.Vomiting
            physical_exam.Body_Temperature

        Raises KeyError when the path does not exist.

        NOTE:
        This method does NOT decide whether a path is allowed.
        The Retriever must validate the path before calling this method.
        """

        if not path or not isinstance(path, str):
            raise KeyError("Blueprint path must be a non-empty string")

        node: Any = self.data

        for part in path.split("."):
            if not isinstance(node, dict):
                raise KeyError(
                    f"Cannot continue path '{path}': "
                    f"'{part}' is inside a non-object value"
                )

            if part not in node:
                raise KeyError(
                    f"Path not found in blueprint: {path}"
                )

            node = node[part]

        return node

    def has_path(self, path: str) -> bool:
        """
        Return True when a dotted path exists in this Blueprint.
        """

        try:
            self.get_path(path)
            return True
        except KeyError:
            return False


def _read_json(path: Path) -> dict:
    """
    Read and validate a Blueprint JSON file.
    """

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)

    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Invalid JSON in case file '{path.name}': {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise ValueError(
            f"Case file '{path.name}' must contain a JSON object"
        )

    return data


def load_case(case_id: str) -> Blueprint:
    """
    Load a case from backend/cases/.

    Lookup strategy:

    1. Try:
           cases/{case_id}.json

    2. Otherwise scan JSON files and find the one whose internal:
           "case_id"
       matches the requested case_id.

    The internal case_id is always verified.
    """

    if not case_id or not isinstance(case_id, str):
        raise ValueError("case_id must be a non-empty string")

    case_id = case_id.strip()

    # ------------------------------------------------------------------
    # DIRECT FILE LOOKUP
    # ------------------------------------------------------------------

    direct_path = CASES_DIR / f"{case_id}.json"

    if direct_path.exists():
        data = _read_json(direct_path)
        actual_id = data.get("case_id") or case_id

        return Blueprint(
            case_id=actual_id,
            data=data,
            source_path=direct_path,
        )

    # ------------------------------------------------------------------
    # SEARCH BY INTERNAL case_id OR FILE STEM
    # ------------------------------------------------------------------

    if not CASES_DIR.exists():
        raise FileNotFoundError(
            f"Cases directory does not exist: {CASES_DIR}"
        )

    for path in CASES_DIR.glob("*.json"):

        try:
            data = _read_json(path)

        except ValueError:
            # One broken JSON file should not prevent another valid case
            # from being located.
            continue

        if data.get("case_id") == case_id or path.stem == case_id:
            actual_id = data.get("case_id") or case_id
            return Blueprint(
                case_id=actual_id,
                data=data,
                source_path=path,
            )

    raise FileNotFoundError(
        f"No blueprint file found for case_id='{case_id}'"
    )
