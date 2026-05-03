import runpod
import uuid
import requests

SUPABASE_UPLOAD_URL = "PUT_YOUR_SUPABASE_UPLOAD_URL_HERE"
SUPABASE_KEY = "PUT_YOUR_SERVICE_ROLE_KEY_HERE"


def handler(event):
    import os

    file_path = f"/tmp/{uuid.uuid4()}.wav"

    # create dummy file for test
    with open(file_path, "wb") as f:
        f.write(b"TEST AUDIO DATA")

    # upload to Supabase
    file_name = file_path.split("/")[-1]
    upload_url = f"{SUPABASE_UPLOAD_URL}/{file_name}"

    with open(file_path, "rb") as f:
        requests.put(
            upload_url,
            data=f,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "audio/wav"
            }
        )

    public_url = f"{SUPABASE_UPLOAD_URL}/public/{file_name}"

    return {
        "success": True,
        "audio_url": public_url
    }


runpod.serverless.start({"handler": handler})
