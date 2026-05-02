FROM runpod/pytorch:2.0.1-py3.10-cuda11.8.0-runtime
WORKDIR /app

COPY worker/musicgen/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY worker/musicgen/runpod_handler.py /app/runpod_handler.py

CMD ["python", "-u", "/app/runpod_handler.py"]
