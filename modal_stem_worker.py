"""
SoundioX Modal Demucs stem worker.

This worker implements the same contract expected by the Next.js remote stem
worker path:

Request:
{
  "trackVersionId": string,
  "trackGroupId": string,
  "audioUrl": string,
  "userId": string,
  "outputPrefix": string
}

Response:
{
  "drumsUrl": string,
  "bassUrl": string,
  "vocalsUrl": string,
  "otherUrl": string,
  "metadata": object
}

Local Next.js contract test:
- STEM_ENGINE_MODE=remote_worker
- STEM_REMOTE_WORKER_URL=http://localhost:3000/api/dev/mock-stem-worker

Modal deploy:
- python3 -m modal deploy modal_stem_worker.py

Modal serve:
- python3 -m modal serve modal_stem_worker.py

Required Modal env vars / secrets:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import modal
from fastapi.responses import JSONResponse


app = modal.App("soundiox-stem-worker")
ENDPOINT_LABEL = "stem-worker-v1"
WORK_DIR = Path("/tmp/soundiox_stems")
INPUT_PATH = WORK_DIR / "input.mp3"
DEMUCS_MODEL = "htdemucs"
SUPABASE_BUCKET = "tracks"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "requests==2.31.0",
        "demucs==4.0.1",
        "soundfile==0.12.1",
        "torchcodec",
        "fastapi",
        "uvicorn",
    )
)


def require_text(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key) or "").strip()
    if not value:
        raise ValueError(f"{key} is required")
    return value


def get_supabase_env() -> tuple[str, str]:
    supabase_url = str(os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    service_role_key = str(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

    if not supabase_url or not service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    return supabase_url, service_role_key


def reset_work_dir() -> None:
    if WORK_DIR.exists():
        shutil.rmtree(WORK_DIR)
    WORK_DIR.mkdir(parents=True, exist_ok=True)


def download_audio(audio_url: str) -> Path:
    import requests

    reset_work_dir()

    print("DEMUCS DOWNLOAD START", {"hasAudioUrl": bool(audio_url)}, flush=True)
    response = requests.get(audio_url, timeout=120)
    response.raise_for_status()
    INPUT_PATH.write_bytes(response.content)
    print(
        "DEMUCS DOWNLOAD COMPLETE",
        {"path": str(INPUT_PATH), "bytes": INPUT_PATH.stat().st_size},
        flush=True,
    )

    return INPUT_PATH


def run_demucs(source_path: Path, output_prefix: str) -> dict[str, Path]:
    output_dir = WORK_DIR / "separated"
    command = [
        "python",
        "-m",
        "demucs.separate",
        "-n",
        DEMUCS_MODEL,
        "-o",
        str(output_dir),
        str(source_path),
    ]

    print("DEMUCS RUN START", {"command": command, "outputPrefix": output_prefix}, flush=True)
    result = subprocess.run(command, capture_output=True, text=True, timeout=60 * 25)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "Demucs failed").strip()[-1200:])

    stem_dir = output_dir / DEMUCS_MODEL / source_path.stem
    stem_paths = {
        "drums": stem_dir / "drums.wav",
        "bass": stem_dir / "bass.wav",
        "vocals": stem_dir / "vocals.wav",
        "other": stem_dir / "other.wav",
    }
    missing = [name for name, stem_path in stem_paths.items() if not stem_path.exists()]
    if missing:
        raise RuntimeError(f"Demucs did not produce expected stems: {', '.join(missing)}")

    print(
        "DEMUCS RUN COMPLETE",
        {name: str(stem_path) for name, stem_path in stem_paths.items()},
        flush=True,
    )

    return stem_paths


def upload_stems(stem_paths: dict[str, Path], output_prefix: str) -> dict[str, str]:
    import requests

    supabase_url, service_role_key = get_supabase_env()
    uploaded_urls: dict[str, str] = {}

    for stem_name, stem_path in stem_paths.items():
        object_path = f"{output_prefix}/{stem_name}.wav"
        upload_url = f"{supabase_url}/storage/v1/object/{SUPABASE_BUCKET}/{object_path}"
        headers = {
            "Authorization": f"Bearer {service_role_key}",
            "apikey": service_role_key,
            "Content-Type": "audio/wav",
            "x-upsert": "true",
        }

        with stem_path.open("rb") as stem_file:
            response = requests.post(upload_url, headers=headers, data=stem_file, timeout=180)

        if not response.ok:
            raise RuntimeError(
                f"Supabase upload failed for {stem_name}: {response.status_code} {response.text[:500]}"
            )

        uploaded_urls[stem_name] = (
            f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{object_path}"
        )

    print(
        "DEMUCS UPLOAD COMPLETE",
        {
            "drumsUrl": bool(uploaded_urls.get("drums")),
            "bassUrl": bool(uploaded_urls.get("bass")),
            "vocalsUrl": bool(uploaded_urls.get("vocals")),
            "otherUrl": bool(uploaded_urls.get("other")),
        },
        flush=True,
    )

    return uploaded_urls


def build_response(stem_urls: dict[str, str], started_at: float) -> dict[str, Any]:
    return {
        "drumsUrl": stem_urls["drums"],
        "bassUrl": stem_urls["bass"],
        "vocalsUrl": stem_urls["vocals"],
        "otherUrl": stem_urls["other"],
        "metadata": {
            "provider": "modal-demucs",
            "mock": False,
            "model": DEMUCS_MODEL,
            "processedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "durationSec": round(time.time() - started_at, 3),
        },
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("soundiox-supabase")],
    timeout=60 * 30,
    cpu=4,
)
@modal.fastapi_endpoint(method="POST", label=ENDPOINT_LABEL)
def stem_worker(payload: dict[str, Any]) -> Any:
    started_at = time.time()
    print("DEMUCS STEM WORKER START", flush=True)

    try:
        track_version_id = require_text(payload, "trackVersionId")
        track_group_id = require_text(payload, "trackGroupId")
        audio_url = require_text(payload, "audioUrl")
        user_id = require_text(payload, "userId")
        output_prefix = require_text(payload, "outputPrefix")

        print(
            "DEMUCS STEM WORKER INPUT",
            {
                "trackVersionId": track_version_id,
                "trackGroupId": track_group_id,
                "userId": user_id,
                "outputPrefix": output_prefix,
                "hasAudioUrl": bool(audio_url),
            },
            flush=True,
        )

        source_path = download_audio(audio_url)
        stem_paths = run_demucs(source_path, output_prefix)
        stem_urls = upload_stems(stem_paths, output_prefix)
        response = build_response(stem_urls, started_at)
        print("DEMUCS STEM WORKER COMPLETE", response["metadata"], flush=True)
        return response
    except Exception as error:
        message = str(error) or "Demucs failed"
        print("DEMUCS STEM WORKER ERROR", message, flush=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "demucs_failed",
                "message": message[:1200],
            },
        )
