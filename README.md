# Cluster Nationals 2026–27 — Event Portal & Operations System

A production-grade foundation (Phase 1) for the school-hosted **Cluster Nationals 2026–27**
event. It is a single application with two surfaces powered by **one shared database**:

- **Public Event Portal** — welcoming, informational (Home, Teams, Announcements + structural placeholder pages).
- **Internal Operations System** (`/admin`) — dense, operational dashboards and CRUD for organizers.

The guiding idea: **the website is the single source of truth**. The *Knowledge Base* preserves
not just decisions, but the **reasoning (the WHY)** behind them.

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 19 + TypeScript + Vite            |
| Backend    | Python + FastAPI (REST)                 |
| Database   | PostgreSQL                              |
| ORM        | SQLAlchemy 2                            |
| Migrations | Alembic                                 |
| Validation | Pydantic v2                             |
| Container  | Docker / Docker Compose                 |

---

## Project Structure

```
/app
├── backend/
│   ├── app/
│   │   ├── config.py          # env-driven settings
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   ├── models.py          # normalized relational schema
│   │   ├── schemas.py         # Pydantic schemas + vocabularies
│   │   ├── seed.py            # DEVELOPMENT seed data (manual)
│   │   ├── main.py            # FastAPI app + router wiring
│   │   └── routers/           # health, dashboard, teams, structure,
│   │                          # knowledge, procurement, announcements,
│   │                          # public, search
│   ├── migrations/            # Alembic (env.py + versions/)
│   ├── alembic.ini
│   ├── server.py              # uvicorn entrypoint (server:app)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/ (ui, public, admin)
│   │   ├── pages/ (public, admin)
│   │   ├── lib/ (api, utils, meta)
│   │   ├── App.tsx, main.tsx
│   │   └── index.css
│   ├── vite.config.ts, tsconfig.json, tailwind.config.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Quick Start with Docker Compose

```bash
cp .env.example .env          # then edit secrets (DB password, etc.)
docker compose up --build
```

Services:
- `postgres` → localhost:5432
- `backend`  → http://localhost:8001  (health: `GET /health` and `GET /api/health`)
- `frontend` → http://localhost:5173

The backend applies Alembic migrations automatically on startup. To load the development
dataset once the stack is running:

```bash
docker compose exec backend python -m app.seed
```

---

## Local Development (without Docker)

**Backend**
```bash
cd backend
pip install -r requirements.txt
# Set DATABASE_URL in backend/.env, e.g.
#   DATABASE_URL=postgresql+psycopg2://cluster:clusterpass@localhost:5432/cluster_nationals
alembic upgrade head          # apply migrations
python -m app.seed            # optional: load DEVELOPMENT data
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend**
```bash
cd frontend
yarn install
# REACT_APP_BACKEND_URL points to the backend base URL
yarn dev
```

---

## Database Migrations (Alembic)

```bash
cd backend
alembic revision --autogenerate -m "describe change"   # after editing models.py
alembic upgrade head                                     # apply
alembic downgrade -1                                     # roll back one step
```

---

## Environment Variables

All configuration comes from environment variables — **no secrets in code**. See `.env.example`.

| Variable              | Used by  | Description                                  |
|-----------------------|----------|----------------------------------------------|
| `DATABASE_URL`        | backend  | SQLAlchemy Postgres URL                      |
| `CORS_ORIGINS`        | backend  | Comma-separated allowed origins              |
| `POSTGRES_*`          | compose  | Postgres init credentials                    |
| `REACT_APP_BACKEND_URL` | frontend | Base URL the browser uses for the API       |

---

## API Overview

| Method | Path                                  | Purpose                          |
|--------|---------------------------------------|----------------------------------|
| GET    | `/api/health`                         | Health + DB connectivity         |
| GET    | `/api/dashboard/stats`                | Aggregated dashboard metrics     |
| CRUD   | `/api/teams`                          | Teams                            |
| CRUD   | `/api/buildings` `/floors` `/rooms`   | Building → Floor → Room          |
| CRUD   | `/api/knowledge`                      | Knowledge Base (decisions + WHY) |
| CRUD   | `/api/procurement`                    | Procurement items                |
| CRUD   | `/api/announcements`                  | Announcements                    |
| GET    | `/api/public/teams` `/announcements`  | Public read-only (safe fields)   |
| GET    | `/api/search?q=`                      | Cross-entity global search       |

Public (`/api/public/*`) endpoints expose only non-sensitive fields and never leak internal
organizer data (procurement, knowledge base, notes, contacts).

---

## Phase 1 Scope (Delivered)

Architecture, Docker Compose, PostgreSQL, FastAPI, React+TS+Vite, SQLAlchemy models, Alembic
migrations, REST API, public homepage + navigation, admin navigation + dashboard, **Teams CRUD**,
**Buildings/Floors/Rooms**, **Knowledge Base CRUD**, **Procurement CRUD**, **Announcements CRUD**,
development seed data, global search foundation.

Unfinished modules (Participants, Accommodation, Food, Transport, Venues, Schedule, Tasks,
Documents, Contacts, Settings) are **clearly marked "Coming later"** — their data models already
exist, so they extend without schema changes. No fake functionality is shown.

## Roadmap

- **Phase 2** — Full accommodation/room assignment, participants, food, transport, venues, schedule.
- **Phase 3** — Team-specific portal, QR lookup, live announcements, campus map.
- **Phase 4** — Authentication, role-based access, audit logs, notifications.
- **Phase 5** — Production deployment, backups, monitoring, performance.

> **Note:** All content marked `[DEV]` / `[EXAMPLE]` is placeholder development data, not real
> event information.
