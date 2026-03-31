import express from "express";

const router = express.Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

export async function predictionHandler(req, res) {
  try {
    const r = await fetch(`${ML_SERVICE_URL}/prediction`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch ML prediction" });
  }
}

router.get("/prediction", predictionHandler);

export async function metricsHandler(req, res) {
  try {
    const r = await fetch(`${ML_SERVICE_URL}/metrics`);
    const text = await r.text();
    const contentType = r.headers.get("content-type");

    res.status(r.status);
    if (contentType) {
      res.set("content-type", contentType);
    } else {
      res.type("text/plain");
    }

    res.send(text);
  } catch (err) {
    console.error(err);
    res.status(500).type("text/plain").send("# ERROR failed to fetch ML metrics\n");
  }
}

router.get("/metrics", metricsHandler);

export default router;
