"""
SoundioX persistent RunPod Pod MusicGen worker.

This is a plain HTTP worker for a persistent RunPod Pod, not RunPod
Serverless. It mirrors the remote stem-worker pattern: Next.js sends JSON,
the worker performs the long-running job, uploads to Supabase Storage when
Supabase env vars are present, and returns an audio URL plus metadata.

Run locally:
- python3 -m venv .venv-musicgen
- source .venv-musicgen/bin/activate
- python -m pip install --upgrade pip
- pip install fastapi uvicorn requests soundfile
- pip install torch torchaudio audiocraft
- uvicorn worker.musicgen.runpod_pod_worker:app --host 0.0.0.0 --port 8000

Mock local smoke test:
- MUSICGEN_MOCK_MODE=1 MOCK_AUDIO_URL=https://example.com/test.wav \
  uvicorn worker.musicgen.runpod_pod_worker:app --host 0.0.0.0 --port 8000

Dependency notes:
- /health and mock mode do not import torch, torchaudio, or audiocraft.
- Real generation imports audiocraft lazily inside the generation path only.
- If local Mac installs hit torch/audiocraft conflicts such as torch.onnx exporter
  import errors, use mock mode locally and test real generation on the RunPod Pod
  image where the CUDA/Python package set is controlled.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI
from fastapi.responses import JSONResponse

MODEL_NAME = os.environ.get("MUSICGEN_MODEL_NAME", "facebook/musicgen-small").strip()
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "tracks").strip() or "tracks"
WORK_DIR = Path(os.environ.get("SOUNDIOX_WORK_DIR", "/tmp/soundiox_musicgen_pod"))
OUTPUT_BASENAME = "soundiox-pod-benchmark"
MIN_DURATION_SECONDS = 5
MAX_DURATION_SECONDS = 180
MOCK_MODE = os.environ.get("MUSICGEN_MOCK_MODE", "").strip().lower() in {"1", "true", "yes", "on"}
MOCK_AUDIO_URL = os.environ.get("MOCK_AUDIO_URL", "").strip()

app = FastAPI(title="SoundioX RunPod Pod Music Worker")
_musicgen_model = None


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def require_text(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key) or "").strip()
    if not value:
        raise ValueError(f"{key} is required")
    return value


def clamp_duration(value: Any) -> int:
    try:
        duration = int(value)
    except (TypeError, ValueError):
        duration = MAX_DURATION_SECONDS

    return max(MIN_DURATION_SECONDS, min(MAX_DURATION_SECONDS, duration))


def sanitize_path_part(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9/_-]+", "-", value.strip())
    cleaned = re.sub(r"-+", "-", cleaned).strip("-/")
    return cleaned[:220] or f"ai-generated/runpod-pod-benchmark/{int(time.time() * 1000)}"


def get_supabase_env() -> tuple[str, str] | None:
    supabase_url = str(
        os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip().rstrip("/")
    service_role_key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

    if not supabase_url or not service_role_key:
        return None

    return supabase_url, service_role_key


def load_model():
    global _musicgen_model

    if _musicgen_model is None:
        print("MUSICGEN POD LOAD START", {"model": MODEL_NAME}, flush=True)
        from audiocraft.models import MusicGen

        _musicgen_model = MusicGen.get_pretrained(MODEL_NAME)
        print("MUSICGEN POD LOAD DONE", {"model": MODEL_NAME}, flush=True)

    return _musicgen_model


def build_mock_response(payload: dict[str, Any], started_at: str, started: float) -> dict[str, Any]:
    requested_duration_seconds = clamp_duration(payload.get("durationSeconds"))
    completed_at = utc_now()
    duration_sec = round(time.time() - started, 3)

    return {
        "audioUrl": MOCK_AUDIO_URL or None,
        "metadata": {
            "provider": "runpod_pod_worker",
            "mock": True,
            "model": "mock-musicgen",
            "requestedDurationSeconds": requested_duration_seconds,
            "actualDurationSeconds": 0,
            "durationSec": duration_sec,
            "startedAt": started_at,
            "completedAt": completed_at,
            "mockAudioUrlConfigured": bool(MOCK_AUDIO_URL),
            "message": (
                "MUSICGEN_MOCK_MODE=1 is enabled. No torch/audiocraft imports were attempted."
                if MOCK_AUDIO_URL
                else "MUSICGEN_MOCK_MODE=1 is enabled, but MOCK_AUDIO_URL is not set."
            ),
        },
    }


def write_audio(prompt: str, duration_seconds: int) -> Path:
    from audiocraft.data.audio import audio_write

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    output_path = WORK_DIR / f"{OUTPUT_BASENAME}.wav"
    if output_path.exists():
        output_path.unlink()

    model = load_model()
    model.set_generation_params(duration=duration_seconds)

    print(
        "MUSICGEN POD GENERATION START",
        {"durationSeconds": duration_seconds, "model": MODEL_NAME},
        flush=True,
    )
    wav = model.generate([prompt])
    print("MUSICGEN POD GENERATION DONE", flush=True)

    audio_write(
        str(output_path).replace(".wav", ""),
        wav[0].cpu(),
        model.sample_rate,
        strategy="loudness",
        loudness_compressor=True,
    )

    if not output_path.exists():
        raise RuntimeError("MusicGen output file was not created")

    return output_path


def upload_audio(audio_path: Path, output_prefix: str) -> str | None:
    supabase_env = get_supabase_env()
    if not supabase_env:
        print("MUSICGEN POD UPLOAD SKIPPED", {"reason": "missing_supabase_env"}, flush=True)
        return None

    supabase_url, service_role_key = supabase_env
    object_path = f"{sanitize_path_part(output_prefix)}/benchmark.wav"
    upload_url = f"{supabase_url}/storage/v1/object/{SUPABASE_BUCKET}/{object_path}"
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key,
        "Content-Type": "audio/wav",
        "x-upsert": "true",
    }

    print("MUSICGEN POD UPLOAD START", {"objectPath": object_path}, flush=True)
    with audio_path.open("rb") as audio_file:
        response = requests.post(upload_url, headers=headers, data=audio_file, timeout=300)

    if not response.ok:
        raise RuntimeError(f"Supabase upload failed: {response.status_code} {response.text[:500]}")

    public_url = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{object_path}"
    print("MUSICGEN POD UPLOAD DONE", {"audioUrl": bool(public_url)}, flush=True)
    return public_url


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "provider": "runpod_pod_worker",
        "model": MODEL_NAME,
        "mockMode": MOCK_MODE,
    }


@app.post("/")
def generate(payload: dict[str, Any]) -> Any:
    started_at = utc_now()
    started = time.time()

    try:
      if MOCK_MODE:
          return build_mock_response(payload, started_at, started)

      title = require_text(payload, "title")
      prompt = require_text(payload, "prompt")
      output_prefix = require_text(payload, "outputPrefix")
      requested_duration_seconds = clamp_duration(payload.get("durationSeconds"))

      print(
          "MUSICGEN POD REQUEST",
          {
              "title": title,
              "durationSeconds": requested_duration_seconds,
              "outputPrefix": output_prefix,
          },
          flush=True,
      )

      audio_path = write_audio(prompt, requested_duration_seconds)
      audio_url = upload_audio(audio_path, output_prefix)
      completed_at = utc_now()
      duration_sec = round(time.time() - started, 3)

      return {
          "audioUrl": audio_url,
          "metadata": {
              "provider": "runpod_pod_worker",
              "model": MODEL_NAME,
              "requestedDurationSeconds": requested_duration_seconds,
              "actualDurationSeconds": requested_duration_seconds,
              "durationSec": duration_sec,
              "startedAt": started_at,
              "completedAt": completed_at,
              "outputPath": str(audio_path),
              "uploaded": bool(audio_url),
          },
      }
    except Exception as error:
      message = str(error) or "Music generation failed"
      print("MUSICGEN POD ERROR", message, flush=True)
      return JSONResponse(
          status_code=500,
          content={
              "error": "music_generation_failed",
              "message": message[:1200],
              "metadata": {
                  "provider": "runpod_pod_worker",
                  "model": MODEL_NAME,
                  "requestedDurationSeconds": payload.get("durationSeconds"),
                  "durationSec": round(time.time() - started, 3),
                  "startedAt": started_at,
                  "completedAt": utc_now(),
              },
          },
      )
