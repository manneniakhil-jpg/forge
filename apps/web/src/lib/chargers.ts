import { getDb } from "./db";
import { seedStationsNearPoint } from "./seed";
import {
  fetchNearbyEvStations,
  getCachedGoogleStation,
  isGooglePlacesConfigured,
} from "./google-places";
import { coveringCellIndexes } from "./h3-index";
import {
  ensureH3Index,
  getStationIdsInCells,
  loadStation,
  searchStationsInRadius,
  upsertStation,
} from "./station-store";
import { filterStationsAlongCorridor, rankNearbyStations, rankTripStopCandidates, type NearbySearchContext } from "./station-selector";
import {
  haversineKm,
  type ConnectorStandard,
  type ChargingStation,
} from "@ev/domain";

interface SearchParams {
  lat: number;
  lon: number;
  radiusKm: number;
  connectorStandard?: ConnectorStandard;
  minPowerKw?: number;
  networkId?: string;
  priceCeiling?: number;
  ownerId?: string;
}

export type ChargerSearchResult = {
  stations: Array<ChargingStation & { distanceKm: number; outsideRadius?: boolean }>;
  fallbackUsed: boolean;
  regionalDemoAdded: boolean;
  dataSource: "google_places" | "local_seed" | "h3_cache";
};

function searchContext(params: SearchParams): NearbySearchContext {
  return {
    lat: params.lat,
    lon: params.lon,
    radiusKm: params.radiusKm,
    connectorStandard: params.connectorStandard,
    minPowerKw: params.minPowerKw,
    networkId: params.networkId,
    priceCeiling: params.priceCeiling,
  };
}

/** H3 cell union → exact haversine refine → filter → sort (Ev_maps DD-4). */
function searchLocalChargersH3(
  params: SearchParams,
  options: { allowRegionalSeed?: boolean } = {}
): Omit<ChargerSearchResult, "dataSource"> {
  const { allowRegionalSeed = true } = options;
  ensureH3Index();

  let candidates = searchStationsInRadius(params.lat, params.lon, params.radiusKm);
  let ranked = rankNearbyStations(candidates, searchContext(params)).slice(0, 200);

  if (ranked.length > 0) {
    return { stations: ranked, fallbackUsed: false, regionalDemoAdded: false };
  }

  const wideCandidates = searchStationsInRadius(params.lat, params.lon, 250);
  const within250 = rankNearbyStations(wideCandidates, {
    ...searchContext(params),
    radiusKm: 250,
  });

  if (within250.length === 0 && allowRegionalSeed) {
    const db = getDb();
    const added = seedStationsNearPoint(db, params.lat, params.lon);
    if (added) {
      ensureH3Index();
      candidates = searchStationsInRadius(params.lat, params.lon, params.radiusKm);
      ranked = rankNearbyStations(candidates, searchContext(params)).slice(0, 200);
      if (ranked.length > 0) {
        return { stations: ranked, fallbackUsed: false, regionalDemoAdded: true };
      }
    }
  }

  const fallback = within250.slice(0, 5).map((s) => ({ ...s, outsideRadius: true }));
  return {
    stations: fallback,
    fallbackUsed: fallback.length > 0,
    regionalDemoAdded: false,
  };
}

export async function searchChargers(
  params: SearchParams,
  options: { allowRegionalSeed?: boolean } = {}
): Promise<ChargerSearchResult> {
  if (isGooglePlacesConfigured() && !params.networkId) {
    try {
      const googleStations = await fetchNearbyEvStations({
        lat: params.lat,
        lon: params.lon,
        radiusKm: params.radiusKm,
        connectorStandard: params.connectorStandard,
        minPowerKw: params.minPowerKw,
      });

      for (const station of googleStations) {
        upsertStation(station);
      }

      const ranked = rankNearbyStations(googleStations, searchContext(params));
      const inRadius = ranked.slice(0, 200);

      if (inRadius.length > 0) {
        return {
          stations: inRadius,
          fallbackUsed: false,
          regionalDemoAdded: false,
          dataSource: "google_places",
        };
      }

      if (ranked.length > 0) {
        return {
          stations: ranked.slice(0, 5).map((s) => ({ ...s, outsideRadius: true })),
          fallbackUsed: true,
          regionalDemoAdded: false,
          dataSource: "google_places",
        };
      }
    } catch (error) {
      console.error("[chargers] Google Places search failed:", error);
    }
  }

  return { ...searchLocalChargersH3(params, options), dataSource: "h3_cache" };
}

export function getFavorites(ownerId: string): string[] {
  return (
    getDb()
      .prepare("SELECT station_id FROM favorites WHERE owner_id = ?")
      .all(ownerId) as Array<{ station_id: string }>
  ).map((r) => r.station_id);
}

export function addFavorite(ownerId: string, stationId: string): boolean {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) as c FROM favorites WHERE owner_id = ?")
    .get(ownerId) as { c: number };
  if (count.c >= 100) return false;
  const exists = db
    .prepare("SELECT 1 FROM favorites WHERE owner_id = ? AND station_id = ?")
    .get(ownerId, stationId);
  if (exists) return true;
  db.prepare("INSERT INTO favorites (owner_id, station_id, added_at) VALUES (?, ?, ?)").run(
    ownerId,
    stationId,
    new Date().toISOString()
  );
  return true;
}

export function getStationById(stationId: string): ChargingStation | null {
  const fromDb = loadStation(stationId);
  if (fromDb) return fromDb;
  if (stationId.startsWith("gmap_")) {
    return getCachedGoogleStation(stationId);
  }
  return null;
}

function pickCorridorSamplePoints(
  points: Array<{ lat: number; lon: number }>,
  maxSamples: number
): Array<{ lat: number; lon: number }> {
  if (points.length <= maxSamples) return points;
  const picked: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < maxSamples; i++) {
    const idx = Math.round((i * (points.length - 1)) / (maxSamples - 1));
    picked.push(points[idx]);
  }
  return picked;
}

/** H3-backed corridor query: union cells along route samples, refine with haversine. */
export function queryCorridor(
  points: Array<{ lat: number; lon: number }>,
  connectorStandards: ConnectorStandard[],
  corridorKm = 30
): ChargingStation[] {
  if (points.length === 0) return [];
  ensureH3Index();

  const cellSet = new Set<string>();
  for (const pt of points) {
    for (const cell of coveringCellIndexes(pt.lat, pt.lon, corridorKm)) {
      cellSet.add(cell);
      if (cellSet.size >= 500) break;
    }
    if (cellSet.size >= 500) break;
  }

  const stationIds = getStationIdsInCells([...cellSet]);
  const stations: ChargingStation[] = [];
  const seen = new Set<string>();

  for (const stationId of stationIds) {
    if (seen.has(stationId)) continue;
    const station = loadStation(stationId);
    if (!station) continue;
    seen.add(stationId);
    stations.push(station);
  }

  return filterStationsAlongCorridor(stations, points, corridorKm, connectorStandards);
}

export async function queryCorridorAsync(
  points: Array<{ lat: number; lon: number }>,
  connectorStandards: ConnectorStandard[],
  corridorKm = 30,
  seedNear?: { lat: number; lon: number }
): Promise<ChargingStation[]> {
  let results = queryCorridor(points, connectorStandards, corridorKm);
  const seen = new Set(results.map((s) => s.id));

  if (isGooglePlacesConfigured() && points.length > 0) {
    const samples = pickCorridorSamplePoints(points, 6);
    const searchRadiusKm = Math.min(corridorKm, 50);

    for (const sample of samples) {
      for (const standard of connectorStandards) {
        try {
          const googleStations = await fetchNearbyEvStations({
            lat: sample.lat,
            lon: sample.lon,
            radiusKm: searchRadiusKm,
            connectorStandard: standard,
          });
          for (const station of googleStations) {
            upsertStation(station);
            if (seen.has(station.id)) continue;
            if (!filterStationsAlongCorridor([station], points, corridorKm, connectorStandards).length) {
              continue;
            }
            seen.add(station.id);
            results.push(station);
          }
        } catch (error) {
          console.error("[chargers] Google corridor search failed:", error);
        }
      }
    }
  }

  if (results.length === 0) {
    const seedPoint = seedNear ?? points[points.length - 1] ?? points[0];
    if (seedPoint) {
      const db = getDb();
      const added = seedStationsNearPoint(db, seedPoint.lat, seedPoint.lon);
      if (added) {
        ensureH3Index();
        results = queryCorridor(points, connectorStandards, corridorKm);
      }
    }
  }

  return results;
}

/** Sample points every ~40 km along route coordinates up to maxDistanceKm */
export function sampleRoutePoints(
  coordinates: Array<{ lat: number; lon: number }>,
  maxDistanceKm?: number
): Array<{ lat: number; lon: number }> {
  if (coordinates.length === 0) return [];
  const samples: Array<{ lat: number; lon: number }> = [coordinates[0]];
  let accumulated = 0;
  let nextSample = 40;

  for (let i = 1; i < coordinates.length; i++) {
    const seg = haversineKm(
      coordinates[i - 1].lat,
      coordinates[i - 1].lon,
      coordinates[i].lat,
      coordinates[i].lon
    );
    accumulated += seg;
    if (maxDistanceKm !== undefined && accumulated > maxDistanceKm) break;
    if (accumulated >= nextSample) {
      samples.push(coordinates[i]);
      nextSample += 40;
    }
  }

  const last = coordinates[coordinates.length - 1];
  const tail = samples[samples.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lon !== last.lon) {
    samples.push(last);
  }
  return samples;
}

export function findNearestCompatibleStation(
  point: { lat: number; lon: number },
  connectorStandards: ConnectorStandard[],
  maxDistanceKm: number
): { station: ChargingStation; distanceKm: number } | null {
  const stations = queryCorridor([point], connectorStandards, maxDistanceKm);
  const candidates = stations
    .map((station) => ({
      station,
      distanceKm: haversineKm(point.lat, point.lon, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return candidates[0] ?? null;
}

export async function findNearestCompatibleStationAsync(
  point: { lat: number; lon: number },
  connectorStandards: ConnectorStandard[],
  maxDistanceKm: number
): Promise<{ station: ChargingStation; distanceKm: number } | null> {
  const stations = await queryCorridorAsync([point], connectorStandards, maxDistanceKm, point);
  const candidates = stations
    .map((station) => ({
      station,
      distanceKm: haversineKm(point.lat, point.lon, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return candidates[0] ?? null;
}

/** Ranked alternatives near a trip charge stop for user swap UI. */
export async function listCorridorAlternatives(
  needChargeAt: { lat: number; lon: number },
  connectorStandards: ConnectorStandard[],
  arrivalSocPct: number,
  reserveSocPct: number,
  excludeIds: Set<string>,
  limit = 8
): Promise<
  Array<{
    station: ChargingStation;
    distanceKm: number;
    score: number;
    maxPowerKw: number;
  }>
> {
  const corridorKm = 55;
  const stations = await queryCorridorAsync(
    [needChargeAt],
    connectorStandards,
    corridorKm,
    needChargeAt
  );

  const ranked = rankTripStopCandidates(stations, {
    needChargeAt,
    connectorStandards,
    arrivalSocPct,
    reserveSocPct,
    maxDetourKm: corridorKm,
    excludeIds,
  });

  return ranked.slice(0, limit).map((c) => ({
    station: c.station,
    distanceKm: c.distanceKm,
    score: c.score,
    maxPowerKw: Math.max(
      ...c.station.connectors
        .filter((conn) => connectorStandards.includes(conn.standard))
        .map((conn) => conn.maxPowerKw),
      0
    ),
  }));
}

export function getFeedTimestamps(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT network_id, last_success_at FROM feed_health")
    .all() as Array<{ network_id: string; last_success_at: string }>;
  return Object.fromEntries(rows.map((r) => [r.network_id, r.last_success_at]));
}

export { loadStation };
