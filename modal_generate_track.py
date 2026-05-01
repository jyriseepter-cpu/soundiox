"""
SoundioX Modal generation scaffold.

Env notes for the gateway side:
- GENERATION_PROVIDER=modal
- MODAL_GENERATE_TRACK_URL=<Modal deployed endpoint URL>
"""

from __future__ import annotations

import os
import time
from typing import Any

import modal


app = modal.App("soundiox-generate-track")
ENDPOINT_LABEL = "generate-track-v2"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "ffmpeg",
        "libsndfile1",
        "pkg-config",
        "libavformat-dev",
        "libavcodec-dev",
        "libavdevice-dev",
        "libavutil-dev",
        "libavfilter-dev",
        "libswscale-dev",
        "libswresample-dev",
    )
    .pip_install(
        "torch==2.1.0",
        "torchaudio==2.1.0",
        "transformers==4.38.2",
        "accelerate==0.28.0",
        "scipy==1.12.0",
        "soundfile==0.12.1",
        "audiocraft==1.3.0",
    )
)

MODEL_NAME = "facebook/musicgen-small"
OUTPUT_PATH = "/tmp/soundiox_musicgen_test.wav"


@app.function(
    image=image,
    timeout=60 * 10,
    cpu=4,
)
@modal.fastapi_endpoint(method="POST", label=ENDPOINT_LABEL)
def generate_track(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Future SoundioX generation entry point on Modal.

    Expected payload:
    {
      "title": string,
      "finalDirection": string,
      "vocalMode": string
    }

    Real storage upload to R2 / Supabase will be added after this first MusicGen test.
    previewUrl intentionally stays null until storage is connected.
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

    try:
        print("MUSICGEN LOAD START")
        import torch
        from audiocraft.data.audio import audio_write
        from audiocraft.models import MusicGen

        _ = torch.__version__
        model = MusicGen.get_pretrained(MODEL_NAME)
        model.set_generation_params(duration=15)
        print("MUSICGEN LOAD END")

        print("MUSICGEN GENERATION START")
        prompt = final_direction
        wav = model.generate([prompt])
        print("MUSICGEN GENERATION END")

        if os.path.exists(OUTPUT_PATH):
            os.remove(OUTPUT_PATH)

        # The real upload step to R2 / Supabase storage will go here next.
        audio_write(
            OUTPUT_PATH.replace(".wav", ""),
            wav[0].cpu(),
            model.sample_rate,
            strategy="loudness",
            loudness_compressor=True,
        )
        print("OUTPUT PATH:", OUTPUT_PATH)

        duration_sec = round(time.time() - start, 3)

        return {
            "success": True,
            "provider": "modal",
            "model": "musicgen",
            "test": True,
            "track": {
                "id": f"musicgen_test_{int(time.time() * 1000)}",
                "title": title,
                "duration": 15,
                "status": "generated",
                "previewUrl": None,
            },
            "timing": {
                "durationSec": duration_sec,
            },
        }
    except Exception as error:
        return {
            "success": False,
            "provider": "modal",
            "model": "musicgen",
            "error": str(error),
        }
