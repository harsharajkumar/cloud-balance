# Cloud Balance - (React + Express + PostgreSQL)

Cloud Balance is a lightweight cloud project management dashboard built as a full-stack application.

### Features

- Authentication (Register / Login)

- Dashboard overview

- Create new project
  
- Real time Monitoring
  
- Auto scaling
  
- ML models

- Account management

- Logout (session-based authentication)

### Dashboard
- Project overview with live statistics
- Active pod counts across all deployments
- CPU load and memory usage monitoring
- Energy efficiency scores
- Project cards with status indicators

### Real-Time Monitor
- Live CPU usage charts
- Pod status and health monitoring
- Kubernetes events timeline
- Auto-scaling controls (start/stop/simulate)
- Scaling rules visualization
- Historical scaling events


## Tech Stack

### Frontend

- React (Vite)

- React Router

- Custom CSS (SaaS-style UI)

### Backend

- Node.js

- Express.js

- PostgreSQL

- express-session (cookie-based auth)
## Prereqs
- Node.js 18+ (or 20+)
- Docker Desktop (recommended, for Postgres)

## Quick Start (recommended)
### 1) Start Postgres
```bash
cd server
docker compose up -d
```
Updated .env if needed:
```bash
PORT=5001
CLIENT_ORIGIN=http://localhost:5173
PGHOST=localhost
PGPORT=5432
PGUSER=cloudbalance
PGPASSWORD=cloudbalance
PGDATABASE=cloudbalance
SESSION_SECRET=your_secret
```

### 2) Configure environment
```bash
cp .env.example .env
```
(Defaults are already correct for the docker-compose Postgres.)

### 3) Install + run server
```bash
cd server
npm install
npm run db:init
npm run dev
```

Server runs at: http://localhost:5000

### 4) Install + run client
Open a new terminal:
```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Client runs at: http://localhost:5173

### Start PostgreSQL Database

Using Docker (recommended):
```bash
cd server
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` with:
- **Database:** `cloudbalance`
- **User:** `cloudbalance`
- **Password:** `cloudbalance`

 ## Kubernetes Setup

Cloud Balance requires a Kubernetes cluster for auto-scaling features.

### Option 1: Docker Desktop Kubernetes (Easiest)

1. **Enable Kubernetes** in Docker Desktop:
   - Docker Desktop → Settings → Kubernetes → Enable Kubernetes
   - Wait for green indicator

2. **Verify:**
```bash
   kubectl cluster-info
   kubectl get nodes
```
### Option 2: Remote Cluster (Chameleon Cloud)

Configure kubeconfig to point to your remote cluster:
```bash
# Copy kubeconfig from Chameleon Cloud
export KUBECONFIG=/path/to/your/kubeconfig

# Verify connection
kubectl get nodes
```

### Install Metrics Server (Required for CPU/Memory monitoring)
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify metrics are working
kubectl top nodes
kubectl top pods
```

##  Dataset Setup

The auto-scaler uses `server/data/traffic.csv` for traffic simulation.

### Format
```csv
timestamp,cpu_percent,memory_mb,requests_per_sec,pod_count
2024-01-01 10:00:00,45,512,50,1
2024-01-01 10:05:00,52,548,85,2
2024-01-01 10:10:00,78,612,180,3
```

### Sample Dataset

A sample dataset is included. To use your own:

1. Create `server/data/traffic.csv`
2. Follow the CSV format above
3. Restart backend server

## ML Service Setup

The ML inference service lives in `server/ml/app.py` and exposes:

- `GET /prediction` returning JSON with `predicted_requests` and `desired_replicas`
- `GET /metrics` returning Prometheus text format

### Recommended: Run ML service with Docker

This keeps the `xgboost` runtime dependencies consistent across machines.

```bash
docker build -f server/ml/Dockerfile . -t cloud-balance-ml
docker run --rm -p 8001:8001 cloud-balance-ml
```

From the `server/` directory you can also run:

```bash
docker compose up ml
```

### Local Python Setup

On macOS, `xgboost` needs OpenMP:

```bash
brew install libomp
python3 -m venv .venv
source .venv/bin/activate
pip install -r server/ml/requirements.txt
python server/ml/app.py
```

### Model Selection Note

Linear Regression achieved the best offline RMSE during evaluation, but XGBoost is the deployed model because its non-linear response is safer for autoscaling decisions when traffic changes sharply.

##  Testing the Application

### Test 1: Create a Project

1. Login to dashboard
2. Click **"+ New Project"**
3. Fill form:
   - **Name:** Test App
   - **Docker Image:** nginx:latest
   - **Initial Replicas:** 2
   - **Min/Max:** 1-10
   - **Mode:** Random Forest
4. Click **"Create Project"**
5. Wait ~30 seconds for deployment

### Test 2: Monitor Real-Time

1. Click on your project card
2. View **Real-Time Monitor** page
3. See live metrics:
   - Current Pods
   - CPU Usage Chart
   - Pod Details Table

### Test 3: Auto-Scaling

1. In Real-Time Monitor, click **"▶️ Start Auto-Scaling"**
2. Open terminal:
```bash
   watch kubectl get pods
```
3. Watch pods scale based on traffic dataset
4. View scaling history in UI

## 🔧 Development Commands

### Backend
```bash
cd server

npm install          # Install dependencies
npm run dev          # Start dev server with nodemon
npm run db:init      # Initialize database schema
npm run db:reset     # Drop and recreate database
npm start            # Production start
```

### Frontend
```bash
cd client

npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Database
```bash
# Connect to database
psql -U cloudbalance -d cloudbalance

# View tables
\dt

# View projects
SELECT * FROM projects;

# View scaling events
SELECT * FROM scaling_events ORDER BY timestamp DESC LIMIT 10;
```

### Kubernetes
```bash
# View deployments
kubectl get deployments

# View pods
kubectl get pods

# View deployment details
kubectl describe deployment project-<id>

# Scale manually
kubectl scale deployment project-<id> --replicas=3

# View logs
kubectl logs deployment/project-<id>

# Delete deployment
kubectl delete deployment project-<id>
```

##  Troubleshooting

### Backend won't start
```bash
# Check PostgreSQL is running
docker ps

# Check database connection
psql -U cloudbalance -d cloudbalance -c "SELECT 1"

# Reinitialize database
npm run db:reset
npm run db:init
```

### Frontend can't connect to backend
```bash
# Check VITE_API_BASE in client/.env
cat client/.env

# Should be: VITE_API_BASE=http://localhost:5001

# Restart frontend
cd client
npm run dev
```

### Kubernetes connection fails
```bash
# Verify kubectl works
kubectl get nodes

# Check kubeconfig
echo $KUBECONFIG

# Test deployment
kubectl create deployment test --image=nginx
kubectl get deployments
kubectl delete deployment test
```

### Auto-scaling not working
```bash
# Check dataset exists
ls -la server/data/traffic.csv

# Check backend logs for errors
# Look for: "📊 Getting replicas for..."

# Verify deployment exists
kubectl get deployment project-<id>

# Check metrics server
kubectl top nodes
```

### Database schema errors
```bash
# Reset database completely
cd server
npm run db:reset
npm run db:init
<img width="734" height="2228" alt="image" src="https://github.com/user-attachments/assets/c25b5793-5ea1-4f07-976e-703f887dae30" />
```



### Authentication

- Session-based authentication (HTTP-only cookies)

- Projects are scoped to logged-in user

### Test Accounts
Create an account on /auth, then log in.

###  Development Notes

- Backend API routes: /auth, /projects

- Database schema located in: server/src/db/schema.sql

- API wrapper located in: client/src/api.js

##  Future Enhancements

- [ ] ML model training interface
- [ ] Custom scaling rules editor
- [ ] Multi-cluster support
- [ ] Prometheus integration for real metrics
- [ ] Cost analysis dashboard
- [ ] Energy efficiency optimization

