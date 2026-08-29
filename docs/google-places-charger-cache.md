# Google Places adapter + H3 cache (Ev_maps-aligned)

This document describes how to add worldwide charger **discovery** via Google Places API (New) without violating the scaling and caching rules in `docs/Ev_maps.txt`.

Places is used only as an **ingestion source** into our own cache. User-facing search never calls Google on the hot path except on cache miss (target: ≤20% of searches reach durable store / upstream — Req 12.8).

---

## Goals

| Goal | Spec reference |
|------|----------------|
| P99 charger search ≤ 800 ms | Req 5.1 |
| ≤20% of searches hit upstream/durable store | Req 12.8 |
| Availability stale → `Unknown` after 10 min | Req 5.6 |
| Degrade to Reachability_Cache when directory unreachable | Req 5.11, 12.7 |
| Remote start / sessions | **Not** from Google — keep OCPI / network adapters (Req 6) |

---

## Architecture

```
┌─────────────────┐     read only      ┌──────────────────────┐
│  EV Companion   │ ─────────────────► │ Charger_Directory    │
│  (web / RN)     │                    │ (Next.js API today)  │
└─────────────────┘                    └──────────┬───────────┘
                                                  │
                     cache hit (Redis/SQLite)     │
                     ◄─────────────────────────────┤
                                                  │ cache miss
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Cell hydration job  │
                                       │  (async / scheduled) │
                                       └──────────┬───────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                       ▼                       ▼
                 ┌────────────────┐    ┌─────────────────┐    ┌──────────────────┐
                 │ Google Places  │    │ OCPI feeds      │    │ PostGIS (static) │
                 │ searchNearby   │    │ (availability)  │    │ durable store    │
                 └────────────────┘    └─────────────────┘    └──────────────────┘
```

**Rule:** `GET /api/chargers` reads **cell cache → station cache → overlay availability**. Google is invoked only from the **hydration worker**, not from the request thread (except optional lazy fill on miss with strict rate limit).

---

## H3 cache key (matches Ev_maps DD-4)

- **Resolution:** H3 res 7 (~5 km edge) — same as spec task 7.1.
- **Keys:**
  - `cell:{h3Index}` → ordered list of `stationId` (TTL 24h for static membership)
  - `station:{id}` → static attributes JSON (TTL 24h, invalidate on ingest change)
  - `avail:{networkId}` → feed last-success timestamp (for Req 5.6 staleness)
  - `connector:{stationId}:{connectorId}` → availability enum (TTL tied to feed refresh)

**Search flow:**

1. Convert `(lat, lon, radiusKm)` → covering H3 cell set (1–100 km supported).
2. Union station IDs from `cell:*` keys.
3. Hydrate static fields from `station:*` (or SQLite `charging_stations` table).
4. Overlay availability; if feed age > 10 min → `Unknown` (Req 5.6).
5. Filter (connector, min kW, network, price), sort by distance, cap 200 (Req 5.1).

**MVP without Redis:** SQLite tables `h3_cells`, `charging_stations`, `connector_availability` + in-process LRU. Same logic, swap storage later.

---

## Google Places adapter

### When to call Google

| Trigger | Action |
|---------|--------|
| Cell `cell:{h3}` missing or expired | Worker calls Places once per cell, not per user |
| New region first trip plan corridor | Prefetch corridor cells in background |
| Manual admin refresh | Rate-limited backfill |

**Never:** every map pan, every filter change, every trip replan synchronously.

### API

- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchNearby`
- **Type:** `includedTypes: ["electric_vehicle_charging_station"]`
- **Circle:** cell centroid + radius ≈ 2.5 km (res 7) or cover cell polygon
- **Field mask (minimal cost):**  
  `places.id,places.displayName,places.location,places.formattedAddress,places.evChargeOptions`
- **Optional filter (Text Search only):** `evOptions.connectorTypes`, `evOptions.minimumChargingRateKw`

### Mapping → `ChargingStation`

| Google | Our model |
|--------|-----------|
| `places.id` | `id` prefix `gmap_` + place id |
| `displayName.text` | `operatorName` |
| `location` | `latitude`, `longitude` |
| — | `networkId`: `google_places` |
| `evChargeOptions.connectorAggregation[]` | one `Connector` per aggregation |
| `type` (EV_CONNECTOR_TYPE_*) | map to CCS / NACS / CHAdeMO / Type2 |
| `maxChargeRateKw` | `maxPowerKw` |
| `availableCount` / `outOfServiceCount` | derive `Available` / `Occupied` / `Out_Of_Service` / `Unknown` |
| `availabilityLastUpdateTime` | `lastFeedUpdate` |
| — | `remoteStartSupported`: **false** (Places does not provide session control) |
| missing price | `pricePerKwh: "Unknown"` |

### Dedup / merge (Req 10.8)

If a Google station is within 25 m of an OCPI station with similar operator name → merge connectors into one listing (prefer OCPI for availability and remote start).

---

## Quota & cost control

| Control | Target |
|---------|--------|
| Places QPM budget | e.g. 500/min for backfill (well under 6,000 default) |
| User search → Google | **0** on happy path |
| Lazy miss fill | ≤1 Places call per cell per 24h |
| Trip corridor prefetch | cap cells per plan (e.g. 50) |
| Field mask | never request Enterprise+Atmosphere fields unless needed |
| Budget alert | GCP billing alert at $X/day |

**Estimated steady state (illustrative):**

- 50k DAU, 3 charger searches/user/day = 150k searches/day  
- 95% cell cache hit → 7.5k Google calls/day (~$240/day at ~$32/1k Pro — verify current pricing)

Without cache: 150k calls/day → unsustainable.

---

## Implementation phases (repo)

### Phase 1 — Cache-first search (no Google)

- [ ] Add H3 cell index over existing seed + corridor stations (`lib/h3-index.ts`)
- [ ] Refactor `GET /api/chargers` to cell union + filter (already partially in `chargers.ts`)
- [ ] Track `feedTimestamps` per network in API response (currently `{}`)

### Phase 2 — Places ingestion worker

- [ ] `lib/google-places.ts` — searchNearby client, env `GOOGLE_MAPS_API_KEY`
- [ ] `lib/places-mapper.ts` — Google → `ChargingStation`
- [ ] `scripts/hydrate-cells.ts` — CLI to fill cells for Bay Area / route corridors
- [ ] Store in SQLite; dedup against OCPI ids when both exist

### Phase 3 — Async hydration on miss

- [ ] On cache miss: return partial/empty + enqueue cell hydration (do not block user 3s)
- [ ] Or return Reachability_Cache / widen radius fallback (Req 5.9)

### Phase 4 — Production

- [ ] Move cell + station cache to Redis (Ev_maps DD-3)
- [ ] OCPI feeds override Google availability where integrated
- [ ] Metrics: cache hit ratio, Places QPM, P99 `/api/chargers`

---

## Environment

```bash
GOOGLE_MAPS_API_KEY=...          # server-side only, never expose to browser
PLACES_HYDRATION_QPM=500           # worker throttle
PLACES_CELL_TTL_HOURS=24
CHARGER_CACHE_BACKEND=sqlite       # sqlite | redis
```

---

## What this does *not* solve

- Remote start / stop (still simulated or OCPI Session_Service)
- Home electricity rates, notifications, telematics
- 10k RPS on a single Next.js SQLite instance — production needs Redis + horizontal scale per Req 12

---

## References

- [Places searchNearby](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchNearby)
- [Place types — `electric_vehicle_charging_station`](https://developers.google.com/maps/documentation/places/web-service/place-types)
- [Places usage & billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- Internal: `docs/Ev_maps.txt` — Req 5, 7.4, 10, 12.8, tasks 6.x, 7.x
