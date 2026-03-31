import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from flask import Flask, jsonify, Response

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
DATA_DIR = BASE_DIR.parent / "data"

MODEL_PATH = Path(os.getenv("MODEL_PATH", ARTIFACTS_DIR / "xgb_model.joblib"))
FEATURES_PATH = Path(os.getenv("FEATURES_PATH", ARTIFACTS_DIR / "feature_cols.json"))
META_PATH = Path(os.getenv("META_PATH", ARTIFACTS_DIR / "model_meta.json"))
TRAFFIC_PATH = Path(os.getenv("TRAFFIC_PATH", DATA_DIR / "traffic.csv"))

CAPACITY_PER_REPLICA = int(os.getenv("CAPACITY_PER_REPLICA", "500"))
MIN_REPLICAS = int(os.getenv("MIN_REPLICAS", "1"))
MAX_REPLICAS = int(os.getenv("MAX_REPLICAS", "10"))

app = Flask(__name__)

model = joblib.load(MODEL_PATH)

with open(FEATURES_PATH, "r") as f:
    FEATURE_COLS = json.load(f)

model_meta = {}
if META_PATH.exists():
    with open(META_PATH, "r") as f:
        model_meta = json.load(f)


def get_model_feature_names():
    if isinstance(model, xgb.Booster):
        return model.feature_names or []

    if hasattr(model, "feature_names_in_"):
        return list(model.feature_names_in_)

    if hasattr(model, "get_booster"):
        booster = model.get_booster()
        return booster.feature_names or []

    return []


MODEL_FEATURE_NAMES = get_model_feature_names()
if MODEL_FEATURE_NAMES and MODEL_FEATURE_NAMES != FEATURE_COLS:
    raise ValueError(
        "feature_cols.json does not match the serialized model input order"
    )


def load_traffic():
    if not TRAFFIC_PATH.exists():
        raise FileNotFoundError(f"Missing traffic file: {TRAFFIC_PATH}")

    df = pd.read_csv(TRAFFIC_PATH)
    required_columns = {"timestamp", "cpu_percent", "memory_mb", "requests_per_sec", "pod_count"}
    missing_columns = required_columns.difference(df.columns)
    if missing_columns:
        missing_str = ", ".join(sorted(missing_columns))
        raise ValueError(f"traffic.csv is missing required columns: {missing_str}")

    if pd.api.types.is_numeric_dtype(df["timestamp"]):
        raise ValueError(
            "traffic.csv timestamp must be a datetime string like YYYY-MM-DD HH:MM:SS"
        )

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    if df["timestamp"].isna().any():
        raise ValueError("traffic.csv contains invalid timestamp values")

    numeric_columns = ["cpu_percent", "memory_mb", "requests_per_sec", "pod_count"]
    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    if df[numeric_columns].isna().any().any():
        raise ValueError("traffic.csv contains non-numeric values in required numeric columns")

    df = df.sort_values("timestamp").reset_index(drop=True)

    if len(df) <= 120:
        raise ValueError("traffic.csv must contain at least 121 rows to compute lag_120")

    return df


def build_features(df):
    df = df.copy()
    base = "requests_per_sec"

    df["minute_of_day"] = df["timestamp"].dt.hour * 60 + df["timestamp"].dt.minute
    df["sin_minute"] = np.sin(2 * np.pi * df["minute_of_day"] / 1440.0)
    df["cos_minute"] = np.cos(2 * np.pi * df["minute_of_day"] / 1440.0)
    df["hour"] = df["timestamp"].dt.hour
    df["dow"] = df["timestamp"].dt.weekday
    df["is_weekend"] = (df["dow"] >= 5).astype(int)

    for lag in [1, 5, 10, 30, 60, 120]:
        df[f"lag_{lag}"] = df[base].shift(lag)

    df["rolling_mean_5"] = df[base].rolling(5, min_periods=1).mean().shift(1)
    df["rolling_mean_15"] = df[base].rolling(15, min_periods=1).mean().shift(1)
    df["rolling_mean_60"] = df[base].rolling(60, min_periods=1).mean().shift(1)
    df["rolling_std_15"] = df[base].rolling(15, min_periods=1).std().shift(1)
    df["rolling_max_15"] = df[base].rolling(15, min_periods=1).max().shift(1)
    df["diff_1"] = df[base].diff(1)
    df["diff_5"] = df[base].diff(5)

    df = df.dropna().reset_index(drop=True)
    return df


def predict_latest():
    traffic = load_traffic()
    feats = build_features(traffic)

    if feats.empty:
        raise ValueError("Not enough rows in traffic.csv to compute lag features")

    latest = feats.iloc[-1]

    missing_feature_cols = [col for col in FEATURE_COLS if col not in latest.index]
    if missing_feature_cols:
        missing_str = ", ".join(missing_feature_cols)
        raise ValueError(f"Missing feature columns at inference time: {missing_str}")

    row = {col: float(latest[col]) for col in FEATURE_COLS}

    X = pd.DataFrame([row], columns=FEATURE_COLS)

    if isinstance(model, xgb.Booster):
        pred = float(model.predict(xgb.DMatrix(X))[0])
    else:
        pred = float(model.predict(X)[0])

    desired_replicas = int(np.ceil(pred / CAPACITY_PER_REPLICA))
    desired_replicas = max(MIN_REPLICAS, min(MAX_REPLICAS, desired_replicas))

    return {
        "timestamp": str(latest["timestamp"]),
        "current_requests": float(latest["requests_per_sec"]),
        "predicted_requests": pred,
        "desired_replicas": desired_replicas,
        "feature_columns": FEATURE_COLS,
        "model_meta": model_meta,
    }


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/prediction")
def prediction():
    try:
        return jsonify(predict_latest())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/metrics")
def metrics():
    try:
        result = predict_latest()
        pred = result["predicted_requests"]
        replicas = result["desired_replicas"]

        payload = f"""# HELP predicted_requests Predicted next-step requests
# TYPE predicted_requests gauge
predicted_requests {pred:.3f}
# HELP desired_replicas Desired replica count based on prediction
# TYPE desired_replicas gauge
desired_replicas {replicas}
"""
        return Response(payload, mimetype="text/plain; version=0.0.4")
    except Exception as e:
        return Response(f"# ERROR {e}\n", mimetype="text/plain", status=500)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    app.run(host="0.0.0.0", port=port, debug=True)
