import os
import uuid

import requests
import runpod
import soundfile as sf
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL_NAME = "facebook/musicgen-small"
TARGET_DURATION_SECONDS = 24
MAX_NEW_TOKENS = 1280
GUIDANCE_SCALE = 4.5
TEMPERATURE = 0.95
TOP_K = 250
NORMALIZE_PEAK = 0.92

_processor = None
_model = None


def _load_musicgen():
    global _processor, _model

    if _processor is None or _model is None:
        _processor = AutoProcessor.from_pretrained(MODEL_NAME)
        _model = MusicgenForConditionalGeneration.from_pretrained(MODEL_NAME)
        _model.eval()

    return _processor, _model


def _write_generated_wav(file_path, prompt):
    processor, model = _load_musicgen()
    inputs = processor(
        text=[prompt],
        padding=True,
        return_tensors="pt",
    )

    with torch.no_grad():
        wav = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=True,
            guidance_scale=GUIDANCE_SCALE,
            temperature=TEMPERATURE,
            top_k=TOP_K,
        )

    audio_array = wav[0, 0].detach().cpu().numpy()
    peak = float(abs(audio_array).max()) if audio_array.size else 0.0
    if peak > 0:
        audio_array = (audio_array / peak) * NORMALIZE_PEAK
    sample_rate = model.config.audio_encoder.sampling_rate
    sf.write(file_path, audio_array, sample_rate)


def handler(event):
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase_bucket = os.environ.get("SUPABASE_BUCKET", "tracks")
    payload = event.get("input", event)
    prompt = str(payload.get("prompt") or "").strip()

    if not prompt:
        return {
            "success": False,
            "error": "Prompt is required",
        }

    file_name = f"{uuid.uuid4()}.wav"
    file_path = f"/tmp/{file_name}"
    _write_generated_wav(file_path, prompt)

    upload_url = (
        f"{supabase_url}/storage/v1/object/"
        f"{supabase_bucket}/ai-generated/{file_name}"
    )

    with open(file_path, "rb") as wav_file:
        response = requests.put(
            upload_url,
            data=wav_file,
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "audio/wav",
                "x-upsert": "true",
            },
            timeout=30,
        )
        response.raise_for_status()

    public_url = (
        f"{supabase_url}/storage/v1/object/public/"
        f"{supabase_bucket}/ai-generated/{file_name}"
    )

    return {
        "success": True,
        "audio_url": public_url,
    }


runpod.serverless.start({"handler": handler})
