import base64
import os
import uuid

import runpod
import soundfile as sf
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL_NAME = "facebook/musicgen-small"
OUTPUT_DIR = "/tmp"
MAX_NEW_TOKENS = 128
GUIDANCE_SCALE = 2.0
TEMPERATURE = 0.9

_processor = None
_model = None


def _load_musicgen():
    global _processor, _model

    if _processor is None or _model is None:
        print("LOAD MODEL START", flush=True)
        _processor = AutoProcessor.from_pretrained(MODEL_NAME)
        _model = MusicgenForConditionalGeneration.from_pretrained(MODEL_NAME)
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print("MODEL DEVICE:", _device, flush=True)
        _model = _model.to(_device)
        _model.eval()
        print("LOAD MODEL DONE", flush=True)

    return _processor, _model


def handler(event):
    print("RUNPOD HANDLER START", flush=True)

    payload = event.get("input", event)
    prompt = str(payload.get("prompt") or "").strip()

    if not prompt:
        return {
            "error": "Prompt is required",
            "stage": "input",
        }

    file_name = f"soundiox-safe-{uuid.uuid4()}.wav"
    file_path = os.path.join(OUTPUT_DIR, file_name)
    stage = "load"

    try:
        processor, model = _load_musicgen()

        stage = "generation"
        print("GENERATION START", flush=True)
        print("GENERATE CONFIG:", MAX_NEW_TOKENS, GUIDANCE_SCALE, TEMPERATURE, flush=True)
        inputs = processor(
            text=[prompt],
            padding=True,
            return_tensors="pt",
        )
        inputs = {key: value.to(model.device) for key, value in inputs.items()}

        with torch.no_grad():
            wav = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=True,
                guidance_scale=GUIDANCE_SCALE,
                temperature=TEMPERATURE,
            )
        print("GENERATION DONE", flush=True)

        audio_array = wav[0, 0].detach().cpu().numpy()
        sample_rate = model.config.audio_encoder.sampling_rate

        stage = "write"
        print("WRITE AUDIO START", flush=True)
        sf.write(file_path, audio_array, sample_rate)
        print("WRITE AUDIO DONE", flush=True)

        if not os.path.exists(file_path):
            return {
                "error": "Audio file was not created",
                "stage": "write",
            }

        with open(file_path, "rb") as wav_file:
            encoded_audio = base64.b64encode(wav_file.read()).decode("utf-8")

        print("RETURNING OUTPUT", flush=True)
        return {"audio_url": f"data:audio/wav;base64,{encoded_audio}"}
    except Exception as error:
        return {
            "error": str(error),
            "stage": stage,
        }


runpod.serverless.start({"handler": handler})
