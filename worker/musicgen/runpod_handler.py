from __future__ import annotations

import base64
import io
import wave
from typing import Any

import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration


MODEL_NAME = "facebook/musicgen-small"
TARGET_DURATION_SECONDS = 15

_processor: AutoProcessor | None = None
_model: MusicgenForConditionalGeneration | None = None


def _load_model() -> tuple[AutoProcessor, MusicgenForConditionalGeneration]:
    global _processor, _model

    if _processor is None or _model is None:
        _processor = AutoProcessor.from_pretrained(MODEL_NAME)
        _model = MusicgenForConditionalGeneration.from_pretrained(MODEL_NAME)
        _model.eval()

    return _processor, _model


def _wav_data_url(audio_tensor: torch.Tensor, sample_rate: int) -> str:
    audio = audio_tensor.detach().cpu().clamp(-1, 1).numpy()
    pcm = (audio * 32767).astype("int16")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm.tobytes())

    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:audio/wav;base64,{encoded}"


def handler(event: dict[str, Any]) -> dict[str, Any]:
    """
    RunPod serverless handler.

    Expected input:
    {
      "input": {
        "prompt": "Warm synth-pop with a wide chorus"
      }
    }
    """

    payload = event.get("input", event)
    prompt = str(payload.get("prompt") or "").strip()

    if not prompt:
        return {
            "success": False,
            "error": "Prompt is required",
        }

    try:
        processor, model = _load_model()
        inputs = processor(
            text=[prompt],
            padding=True,
            return_tensors="pt",
        )

        with torch.no_grad():
            # Short first-pass generation for serverless testing.
            wav = model.generate(**inputs, max_new_tokens=768)

        audio_tensor = wav[0, 0]
        sample_rate = model.config.audio_encoder.sampling_rate
        audio_url = _wav_data_url(audio_tensor, sample_rate)

        return {
            "success": True,
            "audio_url": audio_url,
        }
    except Exception as error:
        return {
            "success": False,
            "error": str(error),
        }


if __name__ == "__main__":
    try:
        import runpod
    except ImportError as error:
        raise SystemExit(
            "runpod is not installed. Install it in the worker image to start the serverless endpoint."
        ) from error

    runpod.serverless.start({"handler": handler})
