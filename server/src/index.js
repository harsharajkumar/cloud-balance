import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';

const app = express();

app.use(express.json());

app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  credentials: true,
}));

app.set('trust proxy', 1);

app.use(session({
  name: 'cloudbalance.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true behind HTTPS in production
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/projects', projectRoutes);

const port = Number(process.env.PORT || 5001);
app.listen(port, () => {
  console.log(`✅ Server listening on http://localhost:${port}`);
});
