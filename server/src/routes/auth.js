import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const { name, email, password } = parsed.data;

  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (existing.rowCount) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email',
    [name, email, password_hash]
  );

  req.session.user = result.rows[0];
  return res.json({ user: result.rows[0] });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { email, password } = parsed.data;
  const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email=$1', [email]);
  if (!result.rowCount) return res.status(401).json({ error: 'Invalid credentials' });

  const userRow = result.rows[0];
  const ok = await bcrypt.compare(password, userRow.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const user = { id: userRow.id, name: userRow.name, email: userRow.email };
  req.session.user = user;
  return res.json({ user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cloudbalance.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.session.user });
});

router.patch('/me', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });

  const schema = z.object({ name: z.string().min(1).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { name } = parsed.data;
  if (!name) return res.json({ user: req.session.user });

  const updated = await pool.query('UPDATE users SET name=$1 WHERE id=$2 RETURNING id,name,email', [
    name,
    req.session.user.id,
  ]);

  req.session.user = updated.rows[0];
  res.json({ user: updated.rows[0] });
});

export default router;
