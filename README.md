# Cloud Balance — MVP (Login + Dashboard + New Project + Account + Logout)

This is a runnable starter that matches your prototype styling and the MVP scope:
- Login / Register (/auth)
- Dashboard (/)
- New Project (/create)
- Account (/account)
- Logout

## Prereqs
- Node.js 18+ (or 20+)
- Docker Desktop (recommended, for Postgres)

## Quick Start (recommended)
### 1) Start Postgres
```bash
cd server
docker compose up -d
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

## Test Accounts
Create an account on /auth, then log in.

## Notes
- Sessions use an HTTP-only cookie (dev-friendly express-session store). For production you should swap to a persistent session store.
- This MVP stores projects in Postgres and associates them with the logged-in user.
