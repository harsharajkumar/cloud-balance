import { Router } from "express";
import * as k8s from "@kubernetes/client-node";

const router = Router();

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const coreApi = kc.makeApiClient(k8s.CoreV1Api);

router.get("/pods", async (req, res) => {
  try {

    const pods = await coreApi.listNamespacedPod("default");

    const result = pods.body.items.map(pod => ({
      name: pod.metadata.name,
      status: pod.status.phase,
      node: pod.spec.nodeName,
      startTime: pod.status.startTime
    }));

    res.json({
      count: result.length,
      pods: result
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Failed to fetch pods"
    });

  }
});

export default router;