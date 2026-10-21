"""
Intent Router
=============

This component classifies ONLY the high-level intent of the user's message.

It does NOT:
- choose Blueprint fields
- retrieve patient data
- decide access permissions
- answer medical questions

Field matching is handled by semantic_matcher.py.
Access control is handled by access_guard.py.

Keeping these responsibilities separate makes the pipeline more robust,
general, and easier to test.
"""

from enum import Enum

from pydantic import BaseModel

from .llm_client import call_structured
from time import perf_counter


# ---------------------------------------------------------------------------
# INTENT TYPES
# ---------------------------------------------------------------------------

class MessageIntent(str, Enum):
    CASUAL = "casual"

    # Asking the patient / caregiver about symptoms, history, demographics,
    # medications, allergies, etc.
    PATIENT_QUESTION = "patient_question"

    # The learner is trying to perform or request physical examination.
    EXAMINATION = "examination"

    # Asking for or requesting laboratory investigations/results.
    LAB_REQUEST = "lab_request"

    # Asking for or requesting imaging.
    IMAGING_REQUEST = "imaging_request"

    # Asking about diagnosis, assessment, severity, management, prognosis,
    # outcome, or another higher-level clinical conclusion.
    CLINICAL_DECISION = "clinical_decision"

    # Questions about the simulator/app itself.
    META = "meta"

    # Case-related message that does not cleanly fit the categories above.
    CASE_OTHER = "case_other"


class IntentResult(BaseModel):
    intent: MessageIntent


# ---------------------------------------------------------------------------
# SYSTEM PROMPT
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """
You are the high-level intent classifier for a clinical simulation.

Your ONLY task is to classify the user's message into ONE intent category.

Do NOT answer the user.
Do NOT select clinical fields.
Do NOT retrieve patient information.
Do NOT diagnose the patient.

The user may write in:
- English
- Arabic
- Egyptian Arabic
- Franco-Arabic
- mixed languages
- slang
- informal conversational wording
- spelling mistakes

Classify by meaning, not exact wording.

INTENTS:

1. casual
   Greetings, thanks, goodbye, small talk, conversational filler.

2. patient_question
   Questions that would naturally be asked directly to the patient,
   parent, caregiver, or relative.

   This includes questions about:
   - symptoms
   - chief complaint
   - history
   - demographics
   - previous medications
   - allergies
   - bowel or urinary symptoms
   - appetite
   - subjective complaints

3. examination
   The learner is performing, requesting, or asking about a physical
   examination or vital sign that should be obtained by examining the patient.

4. lab_request
   The learner is asking for laboratory testing, whether labs were performed,
   or requesting laboratory results.

5. imaging_request
   The learner is asking for imaging, whether imaging was performed,
   or requesting imaging findings/results.

6. clinical_decision
   The learner asks about:
   - diagnosis
   - differential diagnosis
   - severity
   - clinical assessment
   - management
   - treatment plan
   - prognosis
   - outcome
   - hidden answer / ground truth

7. meta
   Questions about the application, simulator, AI system, technical behavior,
   or how the system works.

8. case_other
   A clinically related case message that does not clearly fit any category above.

IMPORTANT:
- If the message contains both casual language and a clinical question,
  classify according to the clinical question.
- Questions about measured examination findings belong to "examination".
- Questions about raw lab values belong to "lab_request".
- Questions about radiology or ultrasound results belong to "imaging_request".
- Questions asking "what is the diagnosis?" belong to "clinical_decision".
"""


# ---------------------------------------------------------------------------
# STRUCTURED OUTPUT
# ---------------------------------------------------------------------------

def _build_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "intent": {
                "type": "string",
                "enum": [
                    intent.value
                    for intent in MessageIntent
                ],
            },
        },
        "required": ["intent"],
        "additionalProperties": False,
    }


# ---------------------------------------------------------------------------
# CLASSIFIER
# ---------------------------------------------------------------------------

def classify(user_message: str) -> IntentResult:
    """
    Classify the user's message into one high-level intent.

    Fail closed:
    if the classifier fails, treat the message as case-related rather than
    casually handing it to an unrestricted response path.
    """

    if not user_message or not user_message.strip():
        return IntentResult(
            intent=MessageIntent.CASUAL
        )

    schema = _build_schema()

    try:
       t0 = perf_counter()

       raw = call_structured(
            SYSTEM_PROMPT,
            user_message,
            schema,
        )

       print(
            f"[MEDTWIN STEP] Intent LLM: {perf_counter() - t0:.2f}s",
            flush=True
        )

       return IntentResult(**raw)

    except Exception:
        import traceback

        print("=== INTENT ROUTER FAILED ===")
        traceback.print_exc()
        print("============================")

        return IntentResult(
            intent=MessageIntent.CASE_OTHER
        )
