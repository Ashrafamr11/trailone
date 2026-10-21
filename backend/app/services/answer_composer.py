"""
Answer Composer
===============

Produces the final natural response shown to the learner.

This module does NOT decide what information is allowed.
That decision has already been made by:
    semantic_matcher.py
    access_guard.py
    retriever.py

The composer only turns safe, already-approved information into a natural
human response.

Response modes:
- casual conversation
- direct patient/caregiver answer
- examination result
- document/report availability
- blocked/unknown information
"""

import random

from .blueprint_loader import Blueprint
from .retriever import FieldResult, all_not_documented
from .llm_client import call_plain
from time import perf_counter


# ---------------------------------------------------------------------------
# GENERIC IN-CHARACTER FALLBACKS
# ---------------------------------------------------------------------------

IN_CHARACTER_UNKNOWN = [
    "مش عارفة يا دكتور.",
    "مش متأكدة من المعلومة دي.",
    "والله مش عارفة يا دكتور.",
    "محدش قالي حاجة عن ده.",
    "مش فاكرة بصراحة.",
]

EXAM_REQUIRED_RESPONSES = [
    "حضرتك ممكن تفحصها وتشوف يا دكتور.",
    "مش هقدر أحدد ده، حضرتك محتاج تفحصها.",
    "دي حاجة حضرتك تعرفها من الفحص.",
]

DOCUMENT_AVAILABLE_RESPONSES = [
    "آه يا دكتور، عملنا الفحوصات والنتيجة موجودة معايا، حضرتك ممكن تشوفها.",
    "النتيجة موجودة في الورق يا دكتور، ممكن حضرتك تطلع عليها.",
    "آه، التقرير موجود معايا لو حضرتك عايز تشوفه.",
]

BLOCKED_RESPONSES = [
    "مش عارفة يا دكتور.",
    "محدش قالي حاجة عن ده.",
    "مش عندي معلومة عن الموضوع ده.",
]


# ---------------------------------------------------------------------------
# PERSONA
# ---------------------------------------------------------------------------

PERSONA_RULES = """
You are role-playing the patient or caregiver in a medical training simulation.

Speak naturally like a real human being.

Important:
- Use the same language and conversational style as the learner whenever possible.
- If the learner speaks Arabic, reply in natural Arabic.
- If the learner speaks Egyptian Arabic, reply naturally in Egyptian Arabic.
- If the learner speaks English, reply in natural English.
- Keep replies short and realistic.
- Do not sound like a medical textbook.
- Do not use technical jargon unless a normal patient would genuinely use it.
- Never mention the blueprint, JSON, field names, registry, system, data source,
  access rules, or simulation internals.
- Never invent missing information.
- Never reveal diagnosis, management, hidden ground truth, prognosis or outcome
  unless another layer explicitly allowed it.
"""


# ---------------------------------------------------------------------------
# PROMPTS
# ---------------------------------------------------------------------------

CASUAL_SYSTEM_PROMPT = PERSONA_RULES + """

The learner is making casual conversation.

Respond briefly and naturally in character.

Do NOT volunteer symptoms, history, laboratory results, imaging results,
diagnosis, or medical details unless the learner actually asked for them.

You may know this basic identity context:

{identity}
"""


PATIENT_ANSWER_PROMPT = PERSONA_RULES + """

The learner asked the patient/caregiver a question.

You are given VERIFIED facts that the patient/caregiver is allowed to know.

Rules:
1. Answer only from the verified facts below.
2. Translate technical stored values into natural everyday speech when possible,
   without changing their meaning.
3. Do not list unrelated facts.
4. Do not add extra symptoms.
5. If a value is NOT_DOCUMENTED, naturally say you do not know.
6. Keep the answer short and conversational.
7. Do not mention that the information came from records or data.

Verified facts:
{facts}
"""


EXAM_RESULT_PROMPT = """
You are the clinical simulation engine presenting the result of a physical
examination performed by the learner.

Do NOT speak as the patient.

Return only the relevant examination findings that were actually requested
and verified.

Do not add interpretation, diagnosis, or advice.

Verified examination findings:
{facts}
"""


DOCUMENT_RESULT_PROMPT = """
You are the clinical simulation engine presenting requested medical
document/report information.

The learner has explicitly requested to view a report/result.

Return only the verified requested values from that document.

Rules:
- Do not add interpretation.
- Do not diagnose.
- Do not add normal ranges.
- Do not add values that were not requested.
- Keep formatting clear and concise.

Verified document facts:
{facts}
"""


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _safe_get(blueprint: Blueprint, path: str, default=None):
    try:
        value = blueprint.get_path(path)
        return default if value is None else value
    except KeyError:
        return default


def _describe_actor(blueprint: Blueprint) -> str:
    """
    Build minimal identity context for casual conversation.
    """

    name = _safe_get(blueprint, "patient.Name")
    age = _safe_get(blueprint, "patient.Age")
    sex = _safe_get(blueprint, "patient.Sex")

    parts = []

    if name is not None:
        parts.append(f"name: {name}")

    if age is not None:
        parts.append(f"age: {age}")

    if sex is not None:
        parts.append(f"sex: {sex}")

    if not parts:
        return "No additional identity details are available."

    return ", ".join(parts)


def _facts_from_results(field_results: list[FieldResult]) -> list[dict]:
    return [
        result.to_fact_dict_entry()
        for result in field_results
    ]


# ---------------------------------------------------------------------------
# CASUAL
# ---------------------------------------------------------------------------

def compose_casual_reply(
    user_message: str,
    blueprint: Blueprint,
) -> str:
    """
    Casual conversation only.

    Important:
    We deliberately DO NOT pass the chief complaint/opening line here.
    Otherwise a simple greeting such as "صباح الخير" may leak symptoms.
    """

    identity = _describe_actor(blueprint)

    system_prompt = CASUAL_SYSTEM_PROMPT.format(
        identity=identity
    )

    return call_plain(
        system_prompt,
        user_message,
    )


# ---------------------------------------------------------------------------
# PATIENT / CAREGIVER ANSWER
# ---------------------------------------------------------------------------

def compose_patient_answer(
    user_message: str,
    field_results: list[FieldResult],
    blueprint: Blueprint,
) -> str:
    """
    Answer information that a patient/caregiver can naturally know.
    """

    if not field_results or all_not_documented(field_results):
        return random.choice(IN_CHARACTER_UNKNOWN)

    facts = _facts_from_results(field_results)

    system_prompt = PATIENT_ANSWER_PROMPT.format(
        facts=facts
    )

    t0 = perf_counter()

    reply = call_plain(
        system_prompt,
        user_message,
    )

    print(
        f"[MEDTWIN STEP] Answer Composer LLM: {perf_counter() - t0:.2f}s",
        flush=True
    )

    return reply


# ---------------------------------------------------------------------------
# PHYSICAL EXAMINATION
# ---------------------------------------------------------------------------

def compose_exam_required_reply() -> str:
    """
    Used when the learner merely asks the patient about an examination finding
    instead of actually performing the examination.
    """
    return random.choice(EXAM_REQUIRED_RESPONSES)


def compose_exam_result(
    user_message: str,
    field_results: list[FieldResult],
) -> str:
    """
    Used only AFTER the learner explicitly performs/requests the examination.
    """

    if not field_results or all_not_documented(field_results):
        return "لا توجد نتيجة فحص موثقة لهذه النقطة."

    facts = _facts_from_results(field_results)

    system_prompt = EXAM_RESULT_PROMPT.format(
        facts=facts
    )

    return call_plain(
        system_prompt,
        user_message,
    )


# ---------------------------------------------------------------------------
# LABS / IMAGING / DOCUMENTS
# ---------------------------------------------------------------------------

def compose_document_available_reply() -> str:
    """
    Patient-facing reply when a report exists but the learner has not yet
    explicitly asked to view its contents.
    """
    return random.choice(DOCUMENT_AVAILABLE_RESPONSES)


def compose_document_result(
    user_message: str,
    field_results: list[FieldResult],
) -> str:
    """
    Used when the learner explicitly requests to view the actual report/result.
    """

    if not field_results or all_not_documented(field_results):
        return "النتيجة دي مش موثقة في التقرير."

    facts = _facts_from_results(field_results)

    system_prompt = DOCUMENT_RESULT_PROMPT.format(
        facts=facts
    )

    return call_plain(
        system_prompt,
        user_message,
    )


# ---------------------------------------------------------------------------
# BLOCKED
# ---------------------------------------------------------------------------

def compose_blocked_reply() -> str:
    """
    Used for hidden or inaccessible information such as ground truth.
    """
    return random.choice(BLOCKED_RESPONSES)


# ---------------------------------------------------------------------------
# TEMPORARY BACKWARD COMPATIBILITY
# ---------------------------------------------------------------------------

def compose_case_answer(
    user_message: str,
    field_results: list[FieldResult],
    blueprint: Blueprint,
) -> str:
    """
    Temporary compatibility wrapper for old chat.py.

    Once chat.py is migrated to the new pipeline, this function can be removed.
    """

    return compose_patient_answer(
        user_message=user_message,
        field_results=field_results,
        blueprint=blueprint,
    )
