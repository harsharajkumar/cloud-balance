FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY server/ml/requirements.txt /app/server/ml/requirements.txt
RUN pip install --no-cache-dir -r /app/server/ml/requirements.txt

COPY server/ml /app/server/ml
COPY server/data /app/server/data

WORKDIR /app/server/ml

ENV PORT=8001

EXPOSE 8001

CMD ["python", "app.py"]
