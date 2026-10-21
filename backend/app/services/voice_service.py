"""ElevenLabs audio generation. Text is prepared by the caller (chat_voice)."""
import os
from pathlib import Path

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)


def generate_voice(text: str) -> bytes:
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
    if not api_key:
        raise RuntimeError("Missing ELEVENLABS_API_KEY")
    if not voice_id:
        raise RuntimeError("Missing ELEVENLABS_VOICE_ID")
    if not text or not text.strip():
        raise ValueError("Cannot generate voice from empty text")

    client = ElevenLabs(api_key=api_key)
    audio = client.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )
    return b"".join(audio)
