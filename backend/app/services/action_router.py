"""
Action Router
=============

Determines WHAT ACTION the learner is trying to perform.

This is different from intent_router.py:

intent_router.py:
    What type of clinical message is this?

action_router.py:
    What is the learner actually trying to DO?

Examples:
- asking the patient a question
- performing a physical examination
- asking whether a test/report exists
- requesting to view an actual test/report
- general case interaction

Matching is semantic, not keyword-based.
"""

from enum import Enum

from pydantic import BaseModel

from .llm_client import call_structured


# ---------------------------------------------------------------------------
# ACTION TYPES
# ---------------------------------------------------------------------------

class LearnerAction(str, Enum):

    # Normal question directed to patient/caregiver.
    ASK_PATIENT = "ask_patient"

    # Learner is actively performing a physical examination.
    PERFORM_EXAMINATION = "perform_examination"

    # Learner asks whether tests / imaging / reports were done or are available.
    ASK_DOCUMENT_AVAILABILITY = "ask_document_availability"

    # Learner explicitly wants to see/read the actual result/report/value.
    VIEW_DOCUMENT = "view_document"

    # General case-related message that does not fit above.
    OTHER = "other"


class ActionResult(BaseModel):
    action: LearnerAction


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """
You are an action classifier inside a clinical simulation.

Your ONLY job is to identify what the learner is trying to DO.

Do NOT answer the learner.
Do NOT retrieve patient data.
Do NOT choose clinical fields.
Do NOT diagnose.

The learner may write in:
- Arabic
- Egyptian Arabic
- English
- Franco-Arabic
- mixed language
- slang
- indirect conversational language
- spelling mistakes

Classify by MEANING, not exact words.

ACTIONS:

1. ask_patient

The learner is asking the patient or caregiver a normal question.

Examples conceptually:
- asking about symptoms
- asking about history
- asking about medications
- asking about allergies
- asking how the patient feels

This does NOT include performing a physical examination.


2. perform_examination

The learner is actively performing or requesting a physical examination.

Examples conceptually:
- examining the abdomen
- checking the chest
- measuring temperature
- checking pulse
- performing a clinical sign

Important:
A question like:
    "Was abdominal examination normal?"
is NOT automatically performing the exam.

The learner must actually express an intention/action to examine, check,
measure, palpate, inspect, auscultate, test, or otherwise perform the exam.


3. ask_document_availability

The learner is asking whether a laboratory test, imaging study, medical
report, or investigation exists or was performed.

They are NOT yet explicitly requesting the exact contents.

Conceptually:
- Were labs done?
- Did she have an X-ray?
- Do you have the test results?
- Was an ultrasound performed?


4. view_document

The learner explicitly requests the actual contents of a laboratory,
imaging, or medical report.

Conceptually:
- show me the results
- let me see the CBC
- what was the hemoglobin value?
- show the X-ray report
- give me the potassium result

This action means the learner wants the actual documented values/findings.


5. other

Use when none of the above accurately describes the learner's action.


IMPORTANT DISTINCTIONS:

Asking:
    "Did you do blood tests?"
-> ask_document_availability

Requesting:
    "Show me the blood test results."
-> view_document

Asking:
    "Does her abdomen hurt?"
-> ask_patient

Performing:
    "I will examine her abdomen."
-> perform_examination

Return exactly one action.
"""


# ---------------------------------------------------------------------------
# SCHEMA
# ---------------------------------------------------------------------------

def _build_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    action.value
                    for action in LearnerAction
                ],
            }
        },
        "required": ["action"],
        "additionalProperties": False,
    }


# ---------------------------------------------------------------------------
# CLASSIFIER
# ---------------------------------------------------------------------------

def classify_action(
    user_message: str,
) -> ActionResult:
    """
    Determine what action the learner is trying to perform.

    Fail safely to OTHER if classification fails.
    """

    if not user_message or not user_message.strip():
        return ActionResult(
            action=LearnerAction.OTHER
        )

    try:
        raw = call_structured(
            SYSTEM_PROMPT,
            user_message,
            _build_schema(),
        )

        return ActionResult(**raw)

    except Exception:
        import traceback

        print("=== ACTION ROUTER FAILED ===")
        traceback.print_exc()
        print("============================")

        return ActionResult(
            action=LearnerAction.OTHER
        )
