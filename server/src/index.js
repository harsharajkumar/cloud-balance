import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';

import authRoutes from './routes/auth.js';
import mlRoutes from './routes/ml.js';
import projectRoutes from './routes/projects.js';


const app = express();

app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/ml', mlRoutes);
app.use('/projects', projectRoutes);


const port = Number(process.env.PORT || 5001);

app.listen(port, () => {
  console.log(`✅ Server listening on http://localhost:${port}`);
});
