import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

router.get('/', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, description, docker_image, mode, min_replicas, max_replicas, created_at FROM projects WHERE user_id=$1 ORDER BY created_at DESC',
    [req.session.user.id]
  );
  res.json({ projects: result.rows });
});

router.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional().default(''),
    dockerImage: z.string().optional().default(''),
    mode: z.string().optional().default('balanced'),
    minReplicas: z.number().int().min(1).max(50).optional().default(1),
    maxReplicas: z.number().int().min(1).max(200).optional().default(3),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const p = parsed.data;

  const result = await pool.query(
    `INSERT INTO projects (user_id, name, description, docker_image, mode, min_replicas, max_replicas)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, description, docker_image, mode, min_replicas, max_replicas, created_at`,
    [req.session.user.id, p.name, p.description, p.dockerImage, p.mode, p.minReplicas, p.maxReplicas]
  );

  res.status(201).json({ project: result.rows[0] });
});

export default router;
