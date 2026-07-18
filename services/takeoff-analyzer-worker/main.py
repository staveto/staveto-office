"""
Staveto takeoff-analyzer-worker — placeholder FastAPI service.

NOT wired into PlanTakeoffWorkbench / Next.js production routes yet.
Future endpoints (stubs only):
  GET  /health
  POST /analyze-region
  POST /extract-vector-objects
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(
    title="Staveto Takeoff Analyzer Worker",
    version="0.0.1",
    description="Optional Python worker for high-DPI PDF render + vector extract. Not production-wired.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "takeoff-analyzer-worker", "wired": "false"}


@app.post("/analyze-region")
def analyze_region_stub() -> dict[str, object]:
    """Placeholder — do not call from production yet."""
    return {
        "ok": False,
        "error": "NOT_IMPLEMENTED",
        "message": "Wire auth + pypdfium2/pdfplumber/opencv pipeline before enabling.",
    }


@app.post("/extract-vector-objects")
def extract_vector_objects_stub() -> dict[str, object]:
    """Placeholder — do not call from production yet."""
    return {
        "ok": False,
        "error": "NOT_IMPLEMENTED",
        "message": "Vector extraction via pdfplumber / page drawings is planned for a later phase.",
    }
