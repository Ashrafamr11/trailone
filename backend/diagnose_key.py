"""
Standalone diagnostic - run this directly, it has nothing to do with our
app's code. It only checks two things:
  1. Exactly what value python-dotenv is loading from .env (to catch
     hidden whitespace/quotes/newlines you can't see in a text editor).
  2. Whether that key is accepted by OpenAI at all, using a plain HTTP
     request (no openai SDK, no gpt-6-astra, nothing project-specific).

Run from inside backend/:
    python diagnose_key.py
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

key = os.environ.get("LLM_API_KEY")

print("=== STEP 1: what did we actually load from .env? ===")
if key is None:
    print("LLM_API_KEY is not set at all. Check that backend/.env exists")
    print("and contains a line like: LLM_API_KEY=sk-...")
else:
    print("repr() of the loaded value (shows hidden whitespace/quotes):")
    print(repr(key))
    print(f"length: {len(key)}")
    print(f"starts with 'sk-': {key.startswith('sk-')}")
    print(f"has leading/trailing whitespace: {key != key.strip()}")
    print(f"contains a literal quote character: {chr(34) in key or chr(39) in key}")

base_url = os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1/"
models_url = base_url.rstrip("/") + "/models"

print()
print(f"=== STEP 2: does the provider at {base_url} accept this key? ===")
if key:
    resp = requests.get(
        models_url,
        headers={"Authorization": f"Bearer {key.strip()}"},
    )
    print("HTTP status:", resp.status_code)
    print("Response body:", resp.text[:500])
