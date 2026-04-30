"""
SoundioX Modal generation scaffold.

Env notes for the gateway side:
- GENERATION_PROVIDER=modal
- MODAL_GENERATE_TRACK_URL=<Modal deployed endpoint URL>
"""

from __future__ import annotations

import time
from typing import Any

import modal


app = modal.App("soundiox-generate-track")

image = modal.Image.debian_slim().pip_install("fastapi[standard]")


@app.function(image=image)
@modal.web_endpoint(method="POST")
def generate_track(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Future SoundioX generation entry point on Modal.

    Expected payload:
    {
      "title": string,
      "finalDirection": string,
      "vocalMode": string
    }

    Real model generation will be added here later.
    For now, this is a safe scaffold that simulates the generation flow.
    """

    start = time.time()

    title = str(payload.get("title") or "").strip()
    final_direction = str(payload.get("finalDirection") or "").strip()
    vocal_mode = str(payload.get("vocalMode") or "").strip()

    if not title:
        return {"success": False, "error": "Title is required"}

    if not final_direction:
        return {"success": False, "error": "Final direction is required"}

    if not vocal_mode:
        return {"success": False, "error": "Vocal mode is required"}

    # Real GPU model setup and generation work will go here later.
    time.sleep(5)

    duration_sec = round(time.time() - start, 3)

    return {
        "success": True,
        "provider": "modal",
        "mock": True,
        "track": {
            "id": f"modal_mock_{int(time.time() * 1000)}",
            "title": title,
            "duration": 180,
            "status": "generated",
            "previewUrl": None,
        },
        "timing": {
            "durationSec": duration_sec,
        },
    }
