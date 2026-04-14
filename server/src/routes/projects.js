import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { createVMCluster } from '../utils/projectDriver.js';
import { deployProject } from '../k8s/deployProject.js';
import { readTrafficDataset, calculateReplicas } from '../utils/datasetReader.js';
import { scaleDeployment, getCurrentReplicas } from '../k8s/scaleDeployment.js';
import { runOnMaster } from '../k8s/k8sClient.js';

const router = Router();
const DEFAULT_NAMESPACE = 'default';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

// Keep timers and traffic playback independent per project.
const simulationIntervals = new Map();
const trafficSimulationState = new Map();

async function getMlPrediction() {
  const response = await fetch(`${ML_SERVICE_URL}/prediction`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `ML service returned ${response.status}`);
  }

  if (
    !payload ||
    typeof payload.predicted_requests !== 'number' ||
    !Number.isFinite(payload.predicted_requests) ||
    typeof payload.desired_replicas !== 'number' ||
    !Number.isFinite(payload.desired_replicas)
  ) {
    throw new Error('ML service returned an invalid prediction payload');
  }

  return payload;
}

async function tryGetMlPrediction() {
  try {
    return await getMlPrediction();
  } catch (error) {
    console.warn('ML prediction unavailable, falling back to dataset rules:', error.message);
    return null;
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getDeploymentName(projectId) {
  return `project-${projectId}`;
}

function clampReplicas(project, replicas) {
  const min = Number(project.min_replicas) || 1;
  const max = Math.max(min, Number(project.max_replicas) || min);
  return Math.min(max, Math.max(min, Number(replicas) || min));
}

function resetTrafficSimulation(projectId) {
  trafficSimulationState.set(projectId, 0);
}

function clearTrafficSimulation(projectId) {
  trafficSimulationState.delete(projectId);
}

function getNextTrafficData(projectId) {
  const dataset = readTrafficDataset();
  if (dataset.length === 0) {
    return null;
  }

  const currentIndex = trafficSimulationState.get(projectId) || 0;
  const data = dataset[currentIndex % dataset.length];
  trafficSimulationState.set(projectId, currentIndex + 1);
  return data;
}

function stopAutoscaleTimer(projectId) {
  const timer = simulationIntervals.get(projectId);
  if (!timer) {
    return false;
  }

  clearInterval(timer);
  simulationIntervals.delete(projectId);
  return true;
}

function parseCpuToMillicores(cpu) {
  if (!cpu) return 0;
  if (cpu.endsWith('m')) return Number.parseInt(cpu, 10) || 0;
  return Math.round(Number.parseFloat(cpu) * 1000) || 0;
}

function parseMemoryToMB(mem) {
  if (!mem) return 0;
  if (mem.endsWith('Ki')) return Math.round((Number.parseFloat(mem) * 1024) / 1024 / 1024);
  if (mem.endsWith('Mi')) return Number.parseFloat(mem) || 0;
  if (mem.endsWith('Gi')) return Math.round((Number.parseFloat(mem) * 1024) || 0);
  if (mem.endsWith('Ti')) return Math.round((Number.parseFloat(mem) * 1024 * 1024) || 0);
  return Math.round((Number.parseFloat(mem) / (1024 * 1024)) || 0);
}

async function getProjectForUser(projectId, userId) {
  const result = await pool.query(
    `SELECT
       id,
       name,
       description,
       docker_image,
       mode,
       min_replicas,
       max_replicas,
       created_at,
       cluster_master_public_ip,
       cluster_master_private_ip,
       cluster_floating_ip_id
     FROM projects
     WHERE id = $1 AND user_id = $2`,
    [projectId, userId]
  );

  return result.rows[0] || null;
}

function getMasterIp(project) {
  const ip = project.cluster_master_public_ip || project.master_public_ip;
  if (!ip) {
    throw new Error(
      `Project ${project.id} does not have a stored cluster master IP. Add cluster_master_public_ip to the projects table and save it when the VM cluster is created.`
    );
  }
  return ip;
}

async function listPodsOnCluster(masterPublicIp, namespace = DEFAULT_NAMESPACE) {
  const { stdout } = await runOnMaster(
    masterPublicIp,
    `sudo k3s kubectl get pods -n ${shQuote(namespace)} -o json`
  );

  const parsed = JSON.parse(stdout || '{}');
  return parsed.items || [];
}

async function listEventsOnCluster(masterPublicIp, namespace = DEFAULT_NAMESPACE) {
  const { stdout } = await runOnMaster(
    masterPublicIp,
    `sudo k3s kubectl get events -n ${shQuote(namespace)} --sort-by=.lastTimestamp -o json`
  );

  const parsed = JSON.parse(stdout || '{}');
  return parsed.items || [];
}

async function getTopPodMetrics(masterPublicIp, deploymentName, namespace = DEFAULT_NAMESPACE) {
  const { stdout } = await runOnMaster(
    masterPublicIp,
    `sudo k3s kubectl top pods -n ${shQuote(namespace)} -l app=${shQuote(deploymentName)} --no-headers`
  );

  const lines = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [podName, cpu, memory] = line.split(/\s+/);
    return {
      podName,
      cpuMillicores: parseCpuToMillicores(cpu),
      memoryMB: parseMemoryToMB(memory),
    };
  });
}

async function getScalingDecision(project, trafficData) {
  const mlPrediction = await tryGetMlPrediction();
  const desiredReplicas = mlPrediction?.desired_replicas ?? calculateReplicas(trafficData.requests_per_sec);
  const requiredReplicas = clampReplicas(project, desiredReplicas);

  return {
    mlPrediction,
    requiredReplicas,
    source: mlPrediction ? 'ml' : 'dataset',
  };
}

async function recordScalingEvent({
  projectId,
  requestsPerSec,
  predictedRequests,
  oldReplicas,
  newReplicas,
  source,
}) {
  try {
    await pool.query(
      `INSERT INTO scaling_events (
         project_id,
         requests_per_sec,
         predicted_requests,
         old_replicas,
         new_replicas,
         source
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, requestsPerSec, predictedRequests, oldReplicas, newReplicas, source]
    );
    return true;
  } catch (error) {
    console.error('Failed to record scaling event:', error.message);
    return false;
  }
}

async function executeScalingStep(project) {
  const trafficData = getNextTrafficData(project.id);
  if (!trafficData) {
    throw new Error('No traffic data available');
  }

  const deploymentName = getDeploymentName(project.id);
  const masterPublicIp = getMasterIp(project);
  const { mlPrediction, requiredReplicas, source } = await getScalingDecision(project, trafficData);

  const currentReplicaInfo = await getCurrentReplicas({
    masterPublicIp,
    deploymentName,
    namespace: DEFAULT_NAMESPACE,
  });
  const currentReplicas = currentReplicaInfo?.desired ?? (Number(project.min_replicas) || 1);

  let scalingResult = null;
  if (requiredReplicas !== currentReplicas) {
    scalingResult = await scaleDeployment({
      masterPublicIp,
      deploymentName,
      replicas: requiredReplicas,
      namespace: DEFAULT_NAMESPACE,
    });
  }

  const historyRecorded = await recordScalingEvent({
    projectId: project.id,
    requestsPerSec: trafficData.requests_per_sec,
    predictedRequests: mlPrediction?.predicted_requests ?? null,
    oldReplicas: currentReplicas,
    newReplicas: requiredReplicas,
    source,
  });

  return {
    trafficData,
    mlPrediction,
    scaling: {
      requestsPerSec: trafficData.requests_per_sec,
      predictedRequests: mlPrediction?.predicted_requests ?? null,
      previousReplicas: currentReplicas,
      requiredReplicas,
      scaled: requiredReplicas !== currentReplicas,
      source,
      timestamp: new Date().toISOString(),
      historyRecorded,
    },
    scalingResult,
  };
}

/* ── GET ALL PROJECTS ── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         description,
         docker_image,
         mode,
         min_replicas,
         max_replicas,
         created_at,
         cluster_master_public_ip,
         cluster_master_private_ip,
         cluster_floating_ip_id
       FROM projects
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.session.user.id]
    );

    res.json({ projects: result.rows });
  } catch (error) {
    console.error('List projects error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── GET ALL PODS FOR ONE PROJECT CLUSTER ── */
router.get('/pods', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId query param is required' });
    }

    const project = await getProjectForUser(projectId, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const masterPublicIp = getMasterIp(project);
    const pods = await listPodsOnCluster(masterPublicIp, DEFAULT_NAMESPACE);
    const deploymentName = getDeploymentName(project.id);

    const filteredPods = pods
      .filter((pod) => pod?.metadata?.labels?.app === deploymentName)
      .map((pod) => ({
        name: pod.metadata?.name,
        status: pod.status?.phase,
        ready: pod.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True',
        createdAt: pod.metadata?.creationTimestamp,
      }));

    res.json({ pods: filteredPods, total: filteredPods.length });
  } catch (error) {
    console.error('Pods error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── GET CPU/MEMORY METRICS FOR A PROJECT ON ITS VM CLUSTER ── */
router.get('/:id/metrics', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const masterPublicIp = getMasterIp(project);
    const deploymentName = getDeploymentName(project.id);

    let metrics = [];
    try {
      metrics = await getTopPodMetrics(masterPublicIp, deploymentName, DEFAULT_NAMESPACE);
    } catch (metricsError) {
      return res.status(503).json({
        error: 'Cluster metrics are not available yet',
        details: metricsError.message,
      });
    }

    const avgCpuMillicores =
      metrics.length > 0
        ? Math.round(metrics.reduce((sum, m) => sum + m.cpuMillicores, 0) / metrics.length)
        : 0;

    res.json({
      metrics,
      avgCpuMillicores,
      podCount: metrics.length,
    });
  } catch (error) {
    console.error('Metrics error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── GET K8S EVENTS FOR A PROJECT ── */
router.get('/:id/events', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const masterPublicIp = getMasterIp(project);
    const deploymentName = getDeploymentName(project.id);
    const events = await listEventsOnCluster(masterPublicIp, DEFAULT_NAMESPACE);

    const filtered = events
      .filter((event) => {
        const objName =
          event?.involvedObject?.name ||
          event?.regarding?.name ||
          event?.metadata?.name ||
          '';
        return objName.includes(deploymentName);
      })
      .map((event) => ({
        message: event.message,
        reason: event.reason,
        time: event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp,
        type: event.type,
      }))
      .slice(0, 10);

    res.json({ events: filtered });
  } catch (error) {
    console.error('Events error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── CREATE PROJECT + CREATE VM CLUSTER + DEPLOY TO THAT CLUSTER ── */
router.post('/', requireAuth, async (req, res) => {
  const schema = z
    .object({
      name: z.string().min(1),
      description: z.string().optional().default(''),
      dockerImage: z.string().optional().default('nginx'),
      mode: z.enum(['balanced', 'single']).optional().default('balanced'),
      minReplicas: z.coerce.number().int().min(1).max(50).optional().default(1),
      maxReplicas: z.coerce.number().int().min(1).max(200).optional().default(3),
    })
    .refine((data) => data.minReplicas <= data.maxReplicas, {
      message: 'minReplicas must be less than or equal to maxReplicas',
      path: ['maxReplicas'],
    });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: parsed.error.flatten(),
    });
  }

  const p = parsed.data;
  let createdProjectId = null;

  try {
    const projectInsert = await pool.query(
      `INSERT INTO projects
       (user_id, name, description, docker_image, mode, min_replicas, max_replicas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, docker_image, mode, min_replicas, max_replicas, created_at`,
      [
        req.session.user.id,
        p.name,
        p.description,
        p.dockerImage,
        p.mode,
        p.minReplicas,
        p.maxReplicas,
      ]
    );

    const project = projectInsert.rows[0];
    createdProjectId = project.id;
    const deploymentName = getDeploymentName(project.id);

    const cluster = await createVMCluster(
      deploymentName,
      project.docker_image || 'nginx',
      project.min_replicas
    );

    if (!cluster?.master?.publicIp) {
      throw new Error(`Cluster creation succeeded but master IP is missing: ${JSON.stringify(cluster)}`);
    }

    await pool.query(
      `UPDATE projects
       SET cluster_master_public_ip = $1,
           cluster_master_private_ip = $2,
           cluster_floating_ip_id = $3
       WHERE id = $4 AND user_id = $5`,
      [
        cluster.master.publicIp,
        cluster.master.privateIp || null,
        cluster.master.floatingIpId || null,
        project.id,
        req.session.user.id,
      ]
    );

    await deployProject({
      masterPublicIp: cluster.master.publicIp,
      name: deploymentName,
      image: project.docker_image || 'nginx',
      replicas: project.min_replicas,
      namespace: DEFAULT_NAMESPACE,
    });

    return res.status(201).json({
      project: {
        ...project,
        cluster_master_public_ip: cluster.master.publicIp,
        cluster_master_private_ip: cluster.master.privateIp,
        cluster_floating_ip_id: cluster.master.floatingIpId,
      },
    });
  } catch (error) {
    console.error('Create project error:', error.message);

    try {
      if (createdProjectId && req.session.user?.id) {
        await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [
          createdProjectId,
          req.session.user.id,
        ]);
      }
    } catch (cleanupError) {
      console.error('Project cleanup error:', cleanupError.message);
    }

    return res.status(500).json({ error: error.message });
  }
});

/* ── DELETE PROJECT ── */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const deploymentName = getDeploymentName(project.id);
    const masterPublicIp = project.cluster_master_public_ip;

    stopAutoscaleTimer(project.id);
    clearTrafficSimulation(project.id);

    if (masterPublicIp) {
      try {
        await runOnMaster(
          masterPublicIp,
          `sudo k3s kubectl delete deployment ${shQuote(deploymentName)} -n ${shQuote(DEFAULT_NAMESPACE)} --ignore-not-found`
        );
      } catch (k8sError) {
        console.error('Cluster delete error:', k8sError.message);
      }
    }

    await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [
      project.id,
      req.session.user.id,
    ]);

    res.json({
      message: 'Project deleted successfully',
      id: project.id,
      name: project.name,
    });
  } catch (error) {
    console.error('Delete project error:', error.message);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/* ── GET DATASET INFO ── */
router.get('/dataset/info', requireAuth, async (req, res) => {
  try {
    const dataset = readTrafficDataset();

    if (dataset.length === 0) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const summary = {
      totalRecords: dataset.length,
      dateRange: {
        start: dataset[0].timestamp,
        end: dataset[dataset.length - 1].timestamp,
      },
      requestStats: {
        min: Math.min(...dataset.map((d) => d.requests_per_sec)),
        max: Math.max(...dataset.map((d) => d.requests_per_sec)),
        avg: Math.round(dataset.reduce((sum, d) => sum + d.requests_per_sec, 0) / dataset.length),
      },
      sample: dataset.slice(0, 5),
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ── GET RECENT SCALING HISTORY ── */
router.get('/:id/scaling-history', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await pool.query(
      `SELECT
         requests_per_sec,
         predicted_requests,
         old_replicas,
         new_replicas,
         source,
         timestamp
       FROM scaling_events
       WHERE project_id = $1
       ORDER BY timestamp DESC
       LIMIT 50`,
      [project.id]
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Scaling history error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── SIMULATE TRAFFIC & AUTO-SCALE ── */
router.post('/:id/simulate', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await executeScalingStep(project);
    res.json(result);
  } catch (error) {
    console.error('Simulation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── START AUTO-SCALING ── */
router.post('/:id/start-autoscale', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const intervalSchema = z.object({
      intervalSeconds: z.coerce.number().positive().optional().default(10),
    });
    const parsed = intervalSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'intervalSeconds must be a positive number',
        details: parsed.error.flatten(),
      });
    }

    stopAutoscaleTimer(project.id);
    resetTrafficSimulation(project.id);

    const numericInterval = parsed.data.intervalSeconds;
    const deploymentName = getDeploymentName(project.id);

    const timer = setInterval(async () => {
      try {
        const result = await executeScalingStep(project);
        console.log(
          `Auto-scale tick for ${deploymentName}: ${result.scaling.previousReplicas} -> ${result.scaling.requiredReplicas} (${result.scaling.requestsPerSec} req/s, source ${result.scaling.source})`
        );
      } catch (error) {
        console.error(`Auto-scale error for ${deploymentName}:`, error.message);
      }
    }, numericInterval * 1000);

    simulationIntervals.set(project.id, timer);

    res.json({
      message: 'Auto-scaling started',
      projectId: project.id,
      intervalSeconds: numericInterval,
      status: 'running',
    });
  } catch (error) {
    console.error('Start autoscale error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── STOP AUTO-SCALING ── */
router.post('/:id/stop-autoscale', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.session.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const wasRunning = stopAutoscaleTimer(project.id);
    clearTrafficSimulation(project.id);

    res.json({
      message: wasRunning ? 'Auto-scaling stopped' : 'Auto-scaling was not running',
      projectId: project.id,
      status: 'stopped',
    });
  } catch (error) {
    console.error('Stop autoscale error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
