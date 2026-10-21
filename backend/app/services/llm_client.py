"""
Thin wrapper around the LLM API. This is the ONLY module that talks to the
network. Keeping it isolated here means:
  - swapping providers/models later touches one file
  - we can enforce structured (JSON-schema) output in one place
"""

import json
import os
from dotenv import load_dotenv

load_dotenv()  # reads backend/.env into the environment, if present

MODEL_NAME = os.environ.get("LLM_MODEL", "gemini-3.5-flash-lite")

# Optional: point the OpenAI SDK at a different OpenAI-compatible endpoint
# (e.g. Google AI Studio's Gemini endpoint). Leave LLM_BASE_URL unset in
# .env to use OpenAI itself.
BASE_URL = os.environ.get("LLM_BASE_URL") or None

_client = None


def _get_client():
    """
    Lazily construct the OpenAI client on first actual use, not at import
    time. This means the module can be imported (e.g. by tests, or by other
    services that don't happen to need it yet) without requiring the API
    key to be set or the network to be reachable.
    """
    global _client
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(api_key=os.environ["LLM_API_KEY"], base_url=BASE_URL)
    return _client


def call_structured(system_prompt: str, user_message: str, json_schema: dict) -> dict:
    """
    Calls the LLM constrained to return JSON matching json_schema exactly.
    Returns the parsed dict. Raises if the model fails to produce valid JSON
    (caller should treat that as a router failure -> fall back to
    "not documented" rather than guessing).
    """
    response = _get_client().chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "structured_response",
                "schema": json_schema,
                "strict": True,
            },
        },
    )
    raw = response.choices[0].message.content
    return json.loads(raw)


def call_plain(system_prompt: str, user_message: str) -> str:
    """Free-text call, used for casual chat and for phrasing final answers."""
    response = _get_client().chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    return response.choices[0].message.content
