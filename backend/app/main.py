"""
FastAPI app entrypoint.

Run from inside backend/ with:

    uvicorn app.main:app --reload
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.chat import router as chat_router
from .api.case_tools import router as case_tools_router


app = FastAPI(
    title="MedTwin AI",
    version="1.0.0",
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# API ROUTERS
# ---------------------------------------------------------------------------

app.include_router(chat_router)
app.include_router(case_tools_router)


# ---------------------------------------------------------------------------
# STATIC CASE ASSETS
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

CASE_ASSETS_DIR = BASE_DIR / "case_assets"

CASE_ASSETS_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

app.mount(
    "/case-assets",
    StaticFiles(directory=CASE_ASSETS_DIR),
    name="case-assets",
)


# ---------------------------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "MedTwin AI",
    }
