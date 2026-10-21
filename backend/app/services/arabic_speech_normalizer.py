"""Pronunciation-only Egyptian Arabic vocalization for MedTwin AI.

The optional local Ollama model may ADD diacritics, but must never rewrite text.
Every output is verified after diacritics are stripped. If local AI is disabled,
unavailable, or changes the text, the deterministic dictionary is used instead.
No clinical content is sent to Ollama unless MEDTWIN_AI_VOCALIZER_ENABLED=true.
"""

import json
import logging
import os
import re
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

logger = logging.getLogger(__name__)

# Do not alter letters in values: add Arabic diacritics ONLY.
PRONUNCIATION_MAP = {
    "يا دكتور": "يا دُكْتور",
    "بترجع": "بِتْرَجَّع",
    "ترجيع": "تَرْجيع",
    "بتستفرغ": "بِتِسْتَفْرَغ",
    "إسهال": "إِسْهال",
    "اسهال": "اِسْهال",
    "سخونية": "سُخونِيّة",
    "حرارة": "حَرارة",
    "بنتي": "بِنْتي",
    "مامتها": "مامِتْها",
    "عندها": "عِنْدَها",
    "عندي": "عِنْدي",
    "عندهاش": "عِنْدَهاش",
    "مش": "مِش",
    "فاكرة": "فاكْرة",
    "عارفة": "عارْفة",
    "متأكدة": "مِتْأَكِّدة",
    "بالظبط": "بِالظَّبْط",
    "بالضبط": "بِالضَّبْط",
    "دلوقتي": "دِلْوَقْتي",
    "أيوه": "أَيْوَه",
    "ايوه": "اَيْوَه",
    "لأ": "لَأ",
    "مفيش": "مَفيش",
    "علشان": "عَلَشان",
    "عشان": "عَشان",
    "حاجة": "حاجَة",
    "تعبانة": "تَعْبانة",
    "تعبانه": "تَعْبانه",
    "قلقانة": "قَلْقانة",
    "حصل": "حَصَل",
    "قبل": "قَبْل",
    "بعد": "بَعْد",
    "شوية": "شُوَيّة",
    "كويسة": "كُوَيِّسة",
    "طبيعي": "طَبيعي",
    "الصبح": "الصُّبْح",
    "النهارده": "النَّهارْدَه",
    "امبارح": "اِمْبارِح",
    "الدوا": "الدَّوا",
    "الدواء": "الدَّواء",
    "الأدوية": "الأَدْوِيَة",
    "بطنها": "بَطْنَها",
    "بتعيط": "بِتْعَيَّط",
    "بتاكل": "بِتَاكُل",
    "بتشرب": "بِتِشْرَب",
    "الحمد لله": "الحَمْدُ لِلّه",
}

# Arabic diacritics only, rather than ALL combining marks (which could erase
# meaningful non-Arabic characters and weaken the strict comparison).
_ARABIC_MARKS = re.compile(r"[\u064B-\u065F\u0670\u06D6-\u06ED]")


def remove_diacritics(text: str) -> str:
    return _ARABIC_MARKS.sub("", unicodedata.normalize("NFC", text))


for original, pronounced in PRONUNCIATION_MAP.items():
    if _ARABIC_MARKS.search(original) or remove_diacritics(pronounced) != original:
        raise ValueError(f"Pronunciation map must preserve original letters: {original!r}")

_TERMS = sorted(PRONUNCIATION_MAP, key=len, reverse=True)
_PATTERN = re.compile(
    r"(?<!\w)(و?)(" + "|".join(re.escape(t) for t in _TERMS) + r")(?!\w)",
    flags=re.UNICODE,
)


def _dictionary_vocalize(original: str) -> str:
    plain = remove_diacritics(original)

    def replace(match: re.Match[str]) -> str:
        prefix, term = match.group(1), match.group(2)
        return prefix + PRONUNCIATION_MAP[term]

    result = _PATTERN.sub(replace, plain)
    return result if remove_diacritics(result) == plain else original


_SYSTEM_PROMPT = """
You are an Egyptian Arabic pronunciation diacritizer.

TASK:
Add Arabic diacritics to the supplied Egyptian Arabic sentence.
The input may already contain partial diacritics.
Preserve those diacritics and complete the pronunciation naturally.

STRICT RULES:
- Add Arabic diacritic marks ONLY.
- Do not change, add, remove, reorder or correct any letters.
- Preserve every space, number, punctuation mark and line break.
- Never paraphrase, translate or answer the sentence.
- Use spoken Egyptian Arabic, not formal MSA grammatical endings.
- Leave unfamiliar medication names and English words untouched.
- Output ONLY the vocalized sentence.

EXAMPLE:
Input: أنا مش عارفة بنتي بِتْرَجَّع ليه.
Output: أَنا مِش عارْفة بِنْتي بِتْرَجَّع لِيه.

Input: والله يا دُكْتور هي مش بتاكل كويس.
Output: وَالله يا دُكْتور هِيَّ مِش بِتَاكُل كُوَيِّس.
"""

def _ollama_vocalize(text: str) -> str | None:
    """Generate Egyptian Arabic diacritics using local Ollama."""

    base = os.getenv(
        "MEDTWIN_OLLAMA_URL",
        "http://127.0.0.1:11434"
    ).rstrip("/")

    allowed_urls = {
        "http://127.0.0.1:11434",
        "http://localhost:11434",
        "http://[::1]:11434",
    }

    if base not in allowed_urls:
        logger.warning("Ollama URL must be local.")
        return None

    model = os.getenv(
        "MEDTWIN_OLLAMA_MODEL",
        "qwen2.5:3b"
    )

    timeout = float(
        os.getenv("MEDTWIN_OLLAMA_TIMEOUT", "30")
    )

    payload = {
        "model": model,
        "system": _SYSTEM_PROMPT,
        "prompt": (
            "Vocalize the following text. "
            "Return the same text with Egyptian Arabic "
            "diacritics only:\n\n"
            + text
        ),
        "stream": False,
        "keep_alive": "30m",
        "options": {
            "temperature": 0,
            "num_predict": min(
                768,
                max(160, int(len(text) * 2.5))
            ),
        },
    }

    request = Request(
        f"{base}/api/generate",
        data=json.dumps(
            payload,
            ensure_ascii=False
        ).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=utf-8"
        },
        method="POST",
    )

    try:
        from time import perf_counter

        start = perf_counter()

        with urlopen(request, timeout=timeout) as response:
            data = json.load(response)

        elapsed = perf_counter() - start

        print(
            f"[VOCALIZER] Ollama: {elapsed:.2f}s",
            flush=True,
        )

        content = data.get("response")

        if not isinstance(content, str):
            return None

        return content

    except (
        HTTPError,
        URLError,
        TimeoutError,
        ValueError,
        KeyError,
        OSError,
    ) as exc:

        logger.warning(
            "Local AI vocalizer unavailable; "
            "dictionary fallback: %s",
            exc,
        )

        return None


def normalize_egyptian_speech(text: str) -> str:
    """
    Hybrid Egyptian Arabic vocalization.

    Dictionary -> Ollama -> Strict safety validation.
    """

    if not text or not text.strip():
        return text

    plain = remove_diacritics(text)

    # Step 1: Deterministic pronunciation.
    fallback = _dictionary_vocalize(text)

    enabled = os.getenv(
        "MEDTWIN_AI_VOCALIZER_ENABLED",
        "false"
    ).strip().lower() in {
        "1", "true", "yes", "on"
    }

    if not enabled:
        return fallback

    # Step 2: Ask AI to complete the partial diacritics.
    candidate = _ollama_vocalize(fallback)

    if candidate is None:
        return fallback

    # Step 3: Never allow changes to clinical content.
    if remove_diacritics(candidate) != plain:
        logger.warning(
            "AI changed original characters; "
            "using dictionary fallback."
        )
        return fallback

    # Step 4: Reject outputs that do not improve vocalization.
    dictionary_marks = len(
        _ARABIC_MARKS.findall(fallback)
    )

    ai_marks = len(
        _ARABIC_MARKS.findall(candidate)
    )

    if ai_marks <= dictionary_marks:
        logger.info(
            "AI added no extra diacritics; "
            "using dictionary result."
        )
        return fallback

    return candidate
