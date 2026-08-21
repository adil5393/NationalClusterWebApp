# PRD — Cluster Nationals 2026–27

## Original Problem Statement
Production-quality web application for a school-hosted national event, "Cluster Nationals 2026–27"
(~800 participants; teams from across India + international teams from Saudi Arabia). Two surfaces
sharing ONE database: a **public event portal** and an **internal operations system**. The website
must become the **single source of truth**, including a **Knowledge Base** that preserves decisions
AND the reasoning (WHY). Build a strong foundation first (Phase 1), extend incrementally.

## Architecture
- **Frontend:** React 19 + TypeScript + Vite (served on :3000 in preview; :5173 in Docker).
- **Backend:** FastAPI (REST, all routes under `/api`), uvicorn `server:app` on :8001.
- **Database:** PostgreSQL (local cluster at `/app/data/postgres`, db `cluster_nationals`).
- **ORM/Migrations:** SQLAlchemy 2 + Alembic (auto-applied on backend startup).
- **Validation:** Pydantic v2.
- **Containerization:** docker-compose (postgres + backend + frontend) + Dockerfiles + `.env.example`.
- Clear public vs admin API boundary; `/api/public/*` exposes only safe fields.

## User Personas
- **Participants / coaches / parents / visitors** — read public portal.
- **School organizers** — use the internal ops system (open in Phase 1; auth in Phase 4).

## Core Requirements (static)
- Shared normalized schema; no duplicated public/admin data stores.
- Knowledge Base captures decision + reason + owner + status + category + tags.
- No invented real event data; placeholders clearly labelled `[DEV]` / `[EXAMPLE]`.
- No secrets in code; env vars only.

## Implemented (2026-08-21)
- Full relational schema (20 tables): Event, Team, Participant, Coach, Building, Floor, Room,
  AccommodationAssignment, Venue, ScheduleEvent, Announcement, Driver, TransportVehicle,
  TransportAssignment, ProcurementItem, KnowledgeItem, Task, Document, Contact, Comment.
- Phase 2: Room assignments + live occupancy; public Team Portal (coach/room/transport/schedule);
  Knowledge attachments (uploaded files + links) and comments. Integrity guards (duplicate/capacity 409).
- Phase 3: Participant beds (assign individual participants to rooms) + Participants CRUD;
  Transport setup (drivers, vehicles/buses, team transport assignments) flowing into the team portal;
  QR codes per team (printable, opens the public portal) on both the portal and admin Teams table.
- Tested: iteration_1 (30/30), iteration_2 (11/11), iteration_3 (24/24), iteration_4 (8/8), iteration_5 (12/12) — all green.
- Phase 5: Room View (visual bed-by-bed map per building/floor/room); Venue Manager (venue CRUD + venue on schedule events, surfaced on team portals); Export Lists (participant + room-allocation CSV downloads).
- Phase 4: Bed Numbers (label/generate beds per room + assign participants to a specific bed, double-book/wrong-room guards);
  Schedule Builder (fixtures/ceremonies, team-linked events surface on team portals); Bulk Import (CSV/XLSX for teams & participants).
  AccommodationAssignment, Venue, ScheduleEvent, Announcement, Driver, TransportVehicle,
  TransportAssignment, ProcurementItem, KnowledgeItem, Task, Document, Contact.
- Alembic initial migration + auto-upgrade on startup.
- REST API: health, dashboard stats, Teams CRUD, Buildings/Floors/Rooms CRUD, Knowledge CRUD
  (+meta, filters), Procurement CRUD (+meta), Announcements CRUD (+meta), public teams/announcements,
  global search.
- Public portal: homepage (hero, stats, features, CTA), Teams (live + search), Announcements (live),
  structural placeholder pages for About/Schedule/Venues/Accommodation/Food/Transport/Campus/Contacts/FAQ.
- Admin: obsidian-sidebar shell with global search, Dashboard (live stat cards + recent
  decisions/announcements), full CRUD for Teams, Buildings & Rooms, Knowledge Base, Procurement,
  Announcements; remaining modules shown as clearly-marked "Coming later".
- Manual dev seed script (`python -m app.seed`), README, docker-compose, `.env.example`.
- **Tested:** 30/30 backend pytest + all frontend E2E flows pass.

## Backlog / Remaining
- **P1:** Auth + role-based access (gate `/admin` and non-public data) — planned Phase 4.
- **P1:** Full accommodation/room assignment, participants, transport, venues, schedule, food (Phase 2).
- **P2:** Team-specific portal, QR lookup, live announcements, campus map (Phase 3).
- **P2:** Full-text search (pg_trgm/tsvector) as data grows; document/file storage.
- **P2:** Announcement `published_at` set on draft→publish transition; procurement status enum validation;
  knowledge tags → JSON/array column.
- **P3:** Deployment hardening, backups, monitoring, performance (Phase 5).

## Notes
- Phase 1 admin is intentionally open (no auth), per brief. Documented in `test_credentials.md`.
- Managed one-click deploy uses MongoDB; this app uses PostgreSQL, so deploy via the provided
  docker-compose on a cloud VM/container.
