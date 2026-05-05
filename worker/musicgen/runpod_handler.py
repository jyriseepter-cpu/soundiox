import runpod


def handler(event):
    print("RUNPOD TEST HANDLER START", flush=True)
    return {
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    }


runpod.serverless.start({"handler": handler})
