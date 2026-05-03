import runpod
import uuid
import requests


def handler(event):
    import os

    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase_bucket = os.environ.get("SUPABASE_BUCKET", "tracks")

    file_path = f"/tmp/{uuid.uuid4()}.wav"

    # create dummy file for test
    with open(file_path, "wb") as f:
        f.write(b"TEST AUDIO DATA")

    # upload to Supabase
    file_name = file_path.split("/")[-1]
    upload_url = (
        f"{supabase_url}/storage/v1/object/"
        f"{supabase_bucket}/ai-generated/{file_name}"
    )

    with open(file_path, "rb") as f:
        requests.put(
            upload_url,
            data=f,
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "audio/wav",
                "x-upsert": "true",
            }
        )

    public_url = (
        f"{supabase_url}/storage/v1/object/public/"
        f"{supabase_bucket}/ai-generated/{file_name}"
    )

    return {
        "success": True,
        "audio_url": public_url
    }


runpod.serverless.start({"handler": handler})
