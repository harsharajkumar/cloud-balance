import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { deployProject } from '../k8s/deployProject.js';
import * as k8s from '@kubernetes/client-node';
import { readTrafficDataset, getLatestTrafficData } from '../utils/datasetReader.js';
import { scaleDeployment, getCurrentReplicas } from '../k8s/scaleDeployment.js';

const router = Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

// K8s setup
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

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

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

/* ── GET ALL PROJECTS ── */
router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, description, docker_image, mode, min_replicas, max_replicas, created_at
     FROM projects WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.session.user.id]
  );
  res.json({ projects: result.rows });
});

/* ── GET ALL PODS ── */
router.get('/pods', requireAuth, async (req, res) => {
  try {
    const result = await coreV1Api.listNamespacedPod({ namespace: 'default' });
    const pods = result.items.map(pod => ({
      name: pod.metadata.name,
      status: pod.status.phase,
      ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True',
      createdAt: pod.metadata.creationTimestamp
    }));
    res.json({ pods, total: pods.length });
  } catch (error) {
    console.error('Pods error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── GET REAL CPU/MEMORY METRICS FOR A PROJECT ── */
router.get('/:id/metrics', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const metricsApi = new k8s.Metrics(kc);
    const podMetrics = await metricsApi.getPodMetrics('default');

    const projectPods = podMetrics.items.filter(pod =>
      pod.metadata.name.startsWith(`project-${id}`)
    );

    const metrics = projectPods.map(pod => {
      const cpuNano = pod.containers.reduce((sum, c) => {
        const cpu = c.usage.cpu;
        if (cpu.endsWith('n')) return sum + parseInt(cpu) / 1000000;
        if (cpu.endsWith('m')) return sum + parseInt(cpu);
        return sum + parseInt(cpu) * 1000;
      }, 0);

      const memBytes = pod.containers.reduce((sum, c) => {
        const mem = c.usage.memory;
        if (mem.endsWith('Ki')) return sum + parseInt(mem) * 1024;
        if (mem.endsWith('Mi')) return sum + parseInt(mem) * 1024 * 1024;
        return sum + parseInt(mem);
      }, 0);

      return {
        podName: pod.metadata.name,
        cpuMillicores: Math.round(cpuNano),
        cpuPercent: Math.round((cpuNano / 1000) * 100) / 100,
        memoryMB: Math.round(memBytes / 1024 / 1024),
      };
    });

    const avgCpu = metrics.length > 0
      ? Math.round(metrics.reduce((s, m) => s + m.cpuMillicores, 0) / metrics.length)
      : 0;

    res.json({ metrics, avgCpuMillicores: avgCpu, podCount: metrics.length });
  } catch (error) {
    console.error('Metrics error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── GET REAL K8S EVENTS FOR A PROJECT ── */
router.get('/:id/events', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await coreV1Api.listNamespacedEvent({
      namespace: 'default',
      fieldSelector: `involvedObject.name=project-${id}`
    });

    const events = result.items
      .map(e => ({
        message: e.message,
        reason: e.reason,
        time: e.lastTimestamp || e.eventTime,
        type: e.type
      }))
      .slice(0, 10);

    res.json({ events });
  } catch (error) {
    console.error('Events error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── CREATE PROJECT ── */
router.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional().default(''),
    dockerImage: z.string().optional().default('nginx'),
    mode: z.string().optional().default('balanced'),
    minReplicas: z.number().int().min(1).max(50).optional().default(1),
    maxReplicas: z.number().int().min(1).max(200).optional().default(3),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const p = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO projects
       (user_id, name, description, docker_image, mode, min_replicas, max_replicas)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, description, docker_image, mode, min_replicas, max_replicas, created_at`,
      [req.session.user.id, p.name, p.description, p.dockerImage, p.mode, p.minReplicas, p.maxReplicas]
    );

    const project = result.rows[0];

    await deployProject(
      `project-${project.id}`,
      project.docker_image || 'nginx',
      project.min_replicas
    );

    res.status(201).json({ project });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ── DELETE PROJECT ── */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Get project details first
    const project = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData = project.rows[0];

    // Delete Kubernetes deployment
    try {
      const appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
      await appsV1Api.deleteNamespacedDeployment(
        `project-${id}`,
        'default'
      );
      console.log(`Deleted K8s deployment: project-${id}`);
    } catch (k8sError) {
      console.error('K8s delete error:', k8sError.message);
      // Continue even if K8s deletion fails
    }

    // Delete from database
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);

    res.json({ 
      message: 'Project deleted successfully',
      id: id,
      name: projectData.name
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});


// Add these routes BEFORE `export default router;`

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
        end: dataset[dataset.length - 1].timestamp
      },
      requestStats: {
        min: Math.min(...dataset.map(d => d.requests_per_sec)),
        max: Math.max(...dataset.map(d => d.requests_per_sec)),
        avg: Math.round(dataset.reduce((sum, d) => sum + d.requests_per_sec, 0) / dataset.length)
      },
      sample: dataset.slice(0, 5)
    };
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
/* ── SIMULATE TRAFFIC & AUTO-SCALE ── */
router.post('/:id/simulate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const deploymentName = `project-${id}`;
    
    console.log('🎯 Simulating scaling for:', deploymentName); // Debug
    
    const trafficData = getLatestTrafficData();
    
    if (!trafficData) {
      return res.status(404).json({ error: 'No traffic data available' });
    }
    
    console.log('📊 Traffic:', trafficData.requests_per_sec, 'req/s'); // Debug
    
    const mlPrediction = await getMlPrediction();
    const requiredReplicas = mlPrediction.desired_replicas;
    
    console.log('📈 Required replicas:', requiredReplicas); // Debug
    
    // Get current replicas - ADD 'default' namespace
    const currentReplicaInfo = await getCurrentReplicas(deploymentName, 'default');
    const currentReplicas = currentReplicaInfo?.desired || 1;
    
    console.log('🔢 Current replicas:', currentReplicas); // Debug
    
    // Scale if needed
    let scalingResult = null;
    if (requiredReplicas !== currentReplicas) {
      // ADD 'default' namespace
      scalingResult = await scaleDeployment(deploymentName, requiredReplicas, 'default');
      console.log('✅ Scaling completed'); // Debug
    } else {
      console.log('ℹ️ No scaling needed'); // Debug
    }
    
    // Save scaling event to database (optional)
    await pool.query(
      `INSERT INTO scaling_events (project_id, requests_per_sec, old_replicas, new_replicas, timestamp)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [id, trafficData.requests_per_sec, currentReplicas, requiredReplicas]
    ).catch(() => {}); // Ignore if table doesn't exist
    
    res.json({
      trafficData,
      mlPrediction,
      scaling: {
        requestsPerSec: trafficData.requests_per_sec,
        predictedRequests: mlPrediction.predicted_requests,
        previousReplicas: currentReplicas,
        requiredReplicas,
        scaled: requiredReplicas !== currentReplicas,
        timestamp: new Date().toISOString()
      },
      scalingResult
    });
  } catch (error) {
    console.error('❌ Simulation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ── START ML AUTO-SCALING ── */
let simulationInterval = null;

router.post('/:id/start-autoscale', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { intervalSeconds = 10 } = req.body;
    
    // Stop existing simulation
    if (simulationInterval) {
      clearInterval(simulationInterval);
    }
    
    const deploymentName = `project-${id}`;
    
    console.log('🚀 Starting auto-scaling for:', deploymentName);
    await getMlPrediction();
    
    // Start simulation loop
    simulationInterval = setInterval(async () => {
      try {
        const trafficData = getLatestTrafficData();
        if (!trafficData) return;
        
        const mlPrediction = await getMlPrediction();
        const requiredReplicas = mlPrediction.desired_replicas;
        
        // ADD 'default' namespace
        const currentReplicaInfo = await getCurrentReplicas(deploymentName, 'default');
        const currentReplicas = currentReplicaInfo?.desired || 1;
        
        if (requiredReplicas !== currentReplicas) {
          // ADD 'default' namespace
          await scaleDeployment(deploymentName, requiredReplicas, 'default');
          console.log(`📊 Auto-scaled ${deploymentName}: ${currentReplicas} → ${requiredReplicas} (${trafficData.requests_per_sec} req/s, predicted ${mlPrediction.predicted_requests.toFixed(2)} req/s)`);
        }
      } catch (error) {
        console.error('❌ Auto-scale error:', error.message);
      }
    }, intervalSeconds * 1000);
    
    res.json({
      message: 'Auto-scaling started',
      projectId: id,
      intervalSeconds,
      status: 'running'
    });
  } catch (error) {
    console.error('❌ Start autoscale error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
