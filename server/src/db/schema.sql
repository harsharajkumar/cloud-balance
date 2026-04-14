-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  docker_image TEXT DEFAULT '',
  mode TEXT DEFAULT 'balanced',
  min_replicas INT NOT NULL DEFAULT 1,
  max_replicas INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add VM cluster fields to existing databases too
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cluster_master_public_ip TEXT,
  ADD COLUMN IF NOT EXISTS cluster_master_private_ip TEXT,
  ADD COLUMN IF NOT EXISTS cluster_floating_ip_id TEXT;

CREATE TABLE IF NOT EXISTS scaling_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requests_per_sec NUMERIC NOT NULL,
  predicted_requests NUMERIC,
  old_replicas INT NOT NULL,
  new_replicas INT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dataset',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_scaling_events_project_timestamp
  ON scaling_events(project_id, timestamp DESC);
