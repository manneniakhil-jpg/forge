# EV Companion

A consumer-facing web app that reduces the daily friction of owning an electric vehicle. See your charge level, find compatible nearby chargers on a map, plan trips with charge stops, and track charging costs.

Built from the EV Companion requirements and design specification.

## Features

- **Account & vehicle setup** — Register, sign in, and add your EV from a supported catalog
- **Home dashboard** — State of charge, estimated range, plugged-in status, and stale-data indicators
- **Charger discovery** — Interactive map with filtering by connector type, radius, and power; favorites support
- **Charging sessions** — Remote start/stop at supported stations with live energy and cost tracking
- **Trip planning** — Routes with automatic charge stop insertion based on your vehicle and reserve charge
- **Cost history** — Session list with energy and cost summaries

## Architecture

```
packages/domain   Shared validation, units, staleness, and cache policy (@ev/domain)
apps/web          Next.js web app with API routes and SQLite backend
```

The web app implements a local development slice of the full platform design (Identity, Vehicle Profile, Charger Directory, Session, and Trip Planner services) using SQLite instead of DynamoDB/PostgreSQL/Redis.

## Getting started

### Prerequisites

- Node.js 20+
- npm

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317).

### First use

1. Create an account (password must be at least 12 characters)
2. Add your vehicle from the catalog
3. Explore the home dashboard, charger map, trip planner, and history tabs

Sample charging stations are seeded around the San Francisco Bay Area.

## Project structure

| Path | Description |
|------|-------------|
| `packages/domain/` | Shared TypeScript domain core (validation, formatting, staleness) |
| `apps/web/src/app/api/` | Backend API routes |
| `apps/web/src/lib/` | Database, auth, charger search, trip planner |
| `apps/web/src/components/` | UI components and map |

## API overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/accounts` | Register |
| `POST /api/sessions` | Sign in |
| `GET /api/me` | Current account and active vehicle |
| `GET /api/catalog` | Vehicle catalog |
| `POST /api/vehicles` | Add vehicle profile |
| `GET /api/chargers` | Search nearby chargers |
| `POST /api/trips` | Plan a trip with charge stops |
| `GET /api/charging-sessions` | Active session status |
| `GET /api/history` | Charging history and summary |

## License

Private — all rights reserved.
