import runpod
import uuid
import os

def handler(event):
    prompt = event["input"].get("prompt", "test")

    # TEST: loome fake audio faili
    file_name = f"{uuid.uuid4()}.wav"
    file_path = f"/tmp/{file_name}"

    with open(file_path, "wb") as f:
        f.write(b"FAKEAUDIO")

    # TAGASTAME pathi (RunPod annab selle edasi)
    return {
        "audio_url": file_path
    }

runpod.serverless.start({"handler": handler})
