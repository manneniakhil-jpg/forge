import { getDb } from "./db";
import { seedStationsNearPoint } from "./seed";
import { fetchNearbyEvStations, getCachedGoogleStation, isGooglePlacesConfigured } from "./google-places";
import {
  haversineKm,
  resolveAvailability,
  type ConnectorStandard,
  type ChargingStation,
  type AvailabilityStatus,
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

function loadStation(stationId: string): ChargingStation | null {
  const db = getDb();
  const station = db
    .prepare("SELECT * FROM charging_stations WHERE id = ?")
    .get(stationId) as Record<string, unknown> | undefined;
  if (!station) return null;

  const connectors = db
    .prepare("SELECT * FROM connectors WHERE station_id = ?")
    .all(stationId) as Array<Record<string, unknown>>;

  const feedRow = db
    .prepare("SELECT last_success_at FROM feed_health WHERE network_id = ?")
    .get(station.network_id as string) as { last_success_at: string } | undefined;

  const lastFeedUpdate = (feedRow?.last_success_at ?? station.last_feed_update) as string;

  return {
    id: station.id as string,
    operatorName: station.operator_name as string,
    latitude: station.latitude as number,
    longitude: station.longitude as number,
    networkId: station.network_id as string,
    accessRules: (station.access_rules as string) || "Unknown",
    remoteStartSupported: Boolean(station.remote_start),
    lastFeedUpdate,
    connectors: connectors.map((c) => ({
      id: c.id as string,
      standard: c.standard as ConnectorStandard,
      maxPowerKw: c.max_power_kw as number,
      availability: resolveAvailability(
        c.availability as string,
        lastFeedUpdate
      ) as AvailabilityStatus,
      pricePerKwh:
        c.price_per_kwh === null ? ("Unknown" as const) : (c.price_per_kwh as number),
      currency: (c.currency as string) || "USD",
    })),
  };
}

function matchesFilters(station: ChargingStation, params: SearchParams): boolean {
  if (params.networkId && station.networkId !== params.networkId) return false;

  const matchingConnectors = station.connectors.filter((c) => {
    if (params.connectorStandard && c.standard !== params.connectorStandard) return false;
    if (params.minPowerKw && c.maxPowerKw < params.minPowerKw) return false;
    if (params.priceCeiling !== undefined) {
      if (c.pricePerKwh === "Unknown") return false;
      if (c.pricePerKwh > params.priceCeiling) return false;
    }
    return true;
  });

  return matchingConnectors.length > 0;
}

export type ChargerSearchResult = {
  stations: Array<ChargingStation & { distanceKm: number; outsideRadius?: boolean }>;
  fallbackUsed: boolean;
  regionalDemoAdded: boolean;
  dataSource: "google_places" | "local_seed";
};

function searchLocalChargers(
  params: SearchParams,
  options: { allowRegionalSeed?: boolean } = {}
): Omit<ChargerSearchResult, "dataSource"> {
  const { allowRegionalSeed = true } = options;
  const db = getDb();
  const allIds = db.prepare("SELECT id FROM charging_stations").all() as Array<{ id: string }>;

  const withDistance = allIds
    .map(({ id }) => {
      const station = loadStation(id);
      if (!station) return null;
      const distanceKm = haversineKm(params.lat, params.lon, station.latitude, station.longitude);
      return { ...station, distanceKm };
    })
    .filter((s): s is ChargingStation & { distanceKm: number } => s !== null)
    .filter((s) => matchesFilters(s, params))
    .sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.operatorName.localeCompare(b.operatorName);
    });

  const inRadius = withDistance.filter((s) => s.distanceKm <= params.radiusKm).slice(0, 200);

  if (inRadius.length > 0) {
    return { stations: inRadius, fallbackUsed: false, regionalDemoAdded: false };
  }

  const within250 = withDistance.filter((s) => s.distanceKm <= 250);

  if (within250.length === 0 && allowRegionalSeed) {
    const added = seedStationsNearPoint(db, params.lat, params.lon);
    if (added) {
      const retry = searchLocalChargers(params, { allowRegionalSeed: false });
      return { ...retry, regionalDemoAdded: true };
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

      let filtered = googleStations;
      if (params.priceCeiling !== undefined) {
        filtered = googleStations.filter((s) =>
          s.connectors.some(
            (c) => c.pricePerKwh !== "Unknown" && c.pricePerKwh <= params.priceCeiling!
          )
        );
      }

      const inRadius = filtered.filter((s) => s.distanceKm <= params.radiusKm).slice(0, 200);
      if (inRadius.length > 0) {
        return {
          stations: inRadius,
          fallbackUsed: false,
          regionalDemoAdded: false,
          dataSource: "google_places",
        };
      }

      if (filtered.length > 0) {
        return {
          stations: filtered.slice(0, 5).map((s) => ({ ...s, outsideRadius: true })),
          fallbackUsed: true,
          regionalDemoAdded: false,
          dataSource: "google_places",
        };
      }
    } catch (error) {
      console.error("[chargers] Google Places search failed:", error);
    }
  }

  return { ...searchLocalChargers(params, options), dataSource: "local_seed" };
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
  if (stationId.startsWith("gmap_")) {
    return getCachedGoogleStation(stationId);
  }
  return loadStation(stationId);
}

function stationNearCorridor(
  station: { latitude: number; longitude: number },
  points: Array<{ lat: number; lon: number }>,
  corridorKm: number
): boolean {
  let minDist = Infinity;
  for (const pt of points) {
    const d = haversineKm(pt.lat, pt.lon, station.latitude, station.longitude);
    if (d < minDist) minDist = d;
  }
  return minDist <= corridorKm;
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

export function queryCorridor(
  points: Array<{ lat: number; lon: number }>,
  connectorStandards: ConnectorStandard[],
  corridorKm = 30
): ChargingStation[] {
  const db = getDb();
  const allIds = db.prepare("SELECT id, latitude, longitude FROM charging_stations").all() as Array<{
    id: string;
    latitude: number;
    longitude: number;
  }>;

  const results: ChargingStation[] = [];
  const seen = new Set<string>();

  for (const row of allIds) {
    let minDist = Infinity;
    for (const pt of points) {
      const d = haversineKm(pt.lat, pt.lon, row.latitude, row.longitude);
      if (d < minDist) minDist = d;
    }
    if (minDist > corridorKm) continue;

    const station = loadStation(row.id);
    if (!station || seen.has(station.id)) continue;

    const hasMatching = station.connectors.some(
      (c) =>
        connectorStandards.includes(c.standard) &&
        (c.availability === "Available" || c.availability === "Unknown")
    );
    if (hasMatching) {
      seen.add(station.id);
      results.push(station);
    }
  }

  return results;
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
            if (seen.has(station.id)) continue;
            if (!stationNearCorridor(station, points, corridorKm)) continue;
            const hasMatching = station.connectors.some(
              (c) =>
                connectorStandards.includes(c.standard) &&
                (c.availability === "Available" || c.availability === "Unknown")
            );
            if (!hasMatching) continue;
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
  const candidates = queryCorridor([point], connectorStandards, maxDistanceKm)
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
  const candidates = (await queryCorridorAsync([point], connectorStandards, maxDistanceKm, point))
    .map((station) => ({
      station,
      distanceKm: haversineKm(point.lat, point.lon, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return candidates[0] ?? null;
}
