import math
import os
import uuid
import wave

import requests
import runpod


def _write_test_wav(file_path):
    sample_rate = 44100
    duration_seconds = 2
    frequency = 440.0
    amplitude = 0.35
    total_frames = sample_rate * duration_seconds

    with wave.open(file_path, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        frames = bytearray()
        for frame_index in range(total_frames):
            sample = amplitude * math.sin(2 * math.pi * frequency * frame_index / sample_rate)
            pcm_value = int(max(-1.0, min(1.0, sample)) * 32767)
            frames.extend(pcm_value.to_bytes(2, byteorder="little", signed=True))

        wav_file.writeframes(frames)


def handler(event):
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase_bucket = os.environ.get("SUPABASE_BUCKET", "tracks")

    file_name = f"{uuid.uuid4()}.wav"
    file_path = f"/tmp/{file_name}"
    _write_test_wav(file_path)

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
