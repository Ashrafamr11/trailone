"""
Semantic Field Matcher
======================

Maps the user's natural-language question to safe Blueprint fields.

The registry is dynamic per case.

This component:
- understands meaning, not exact wording
- supports Arabic / Egyptian Arabic / English / mixed language
- never reads patient data
- never decides access permissions
- never invents fields
- only returns fields present in the current case registry
"""

from typing import Any

from .field_registry import CaseFieldRegistry
from .llm_client import call_structured
from time import perf_counter


# ---------------------------------------------------------------------------
# SYSTEM PROMPT
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """
You are the semantic field-matching component of a clinical simulation system.

Your ONLY job is to determine WHAT information the user is asking about.

You are NOT answering the question.
You are NOT retrieving patient data.
You are NOT deciding whether the user is allowed to see the information.
You are ONLY mapping the meaning of the user's message to fields from the
CURRENT CASE REGISTRY below.

IMPORTANT:

- Match by MEANING, not exact wording.
- The user may write in English, Arabic, Egyptian Arabic, Franco-Arabic,
  mixed language, slang, abbreviations, indirect phrasing, or with spelling mistakes.
- Understand paraphrases naturally.
- Never require the user's wording to match the field description literally.
- A question may map to one field, multiple fields, or a broad group.
- Never invent field paths.
- Never invent group names.
- Only use paths/groups that exist in the registry below.
- Do not infer patient facts.
- Do not diagnose.
- Do not reveal hidden information.
- If there is genuinely no relevant field in the registry, return empty lists.

For broad questions:
- If the user asks generally about symptoms, history, labs, imaging,
  examination findings, demographics, or another semantic category,
  use the relevant group if available.

For specific questions:
- Return the most directly relevant field(s).

CURRENT CASE REGISTRY:

{menu}
"""


# ---------------------------------------------------------------------------
# SCHEMA
# ---------------------------------------------------------------------------

def _build_schema(
    registry: CaseFieldRegistry,
) -> dict:

    allowed_paths = [
        field.path
        for field in registry.fields
    ]

    allowed_groups = registry.available_groups()

    properties: dict[str, Any] = {
        "fields": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": allowed_paths,
            },
        },
        "groups": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": allowed_groups,
            },
        },
    }

    return {
        "type": "object",
        "properties": properties,
        "required": [
            "fields",
            "groups",
        ],
        "additionalProperties": False,
    }


# ---------------------------------------------------------------------------
# GROUP EXPANSION
# ---------------------------------------------------------------------------

def _expand_groups(
    registry: CaseFieldRegistry,
    groups: list[str],
) -> list[str]:

    paths: list[str] = []

    for group in groups:
        for field in registry.fields_for_group(group):
            paths.append(field.path)

    return paths


# ---------------------------------------------------------------------------
# MAIN MATCHER
# ---------------------------------------------------------------------------

def match_fields(
    user_message: str,
    registry: CaseFieldRegistry,
) -> list[str]:
    """
    Semantically match the user's message against the CURRENT CASE registry.

    Returns only safe paths already present in that registry.
    """

    if not user_message or not user_message.strip():
        return []

    if not registry.fields:
        return []

    system_prompt = SYSTEM_PROMPT.format(
        menu=registry.menu_text()
    )

    schema = _build_schema(registry)

    try:
        t0 = perf_counter()

        raw = call_structured(
            system_prompt,
            user_message,
            schema,
        )

        print(
            f"[MEDTWIN STEP] Semantic Matcher LLM: {perf_counter() - t0:.2f}s",
            flush=True
        )

    except Exception:
        import traceback

        print("=== SEMANTIC MATCHER FAILED ===")
        traceback.print_exc()
        print("===============================")

        return []

    direct_fields = raw.get("fields", [])
    groups = raw.get("groups", [])

    group_fields = _expand_groups(
        registry,
        groups,
    )

    combined = [
        *direct_fields,
        *group_fields,
    ]

    results: list[str] = []
    seen: set[str] = set()

    for path in combined:

        if path in seen:
            continue

        if not registry.is_valid_path(path):
            continue

        seen.add(path)
        results.append(path)

    return results
