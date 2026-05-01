FROM runpod/pytorch:2.1.0-py3.10-cuda12.1.1-runtime

WORKDIR /app

COPY worker/musicgen/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY worker/musicgen/runpod_handler.py /app/runpod_handler.py

CMD ["python", "-u", "/app/runpod_handler.py"]
