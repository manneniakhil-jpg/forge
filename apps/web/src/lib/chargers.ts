import { getDb } from "./db";
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

export function searchChargers(params: SearchParams): {
  stations: Array<ChargingStation & { distanceKm: number; outsideRadius?: boolean }>;
  fallbackUsed: boolean;
} {
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
    return { stations: inRadius, fallbackUsed: false };
  }

  const fallback = withDistance
    .filter((s) => s.distanceKm <= 250)
    .slice(0, 5)
    .map((s) => ({ ...s, outsideRadius: true }));

  return { stations: fallback, fallbackUsed: true };
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
  return loadStation(stationId);
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

  for (const row of allIds) {
    let minDist = Infinity;
    for (const pt of points) {
      const d = haversineKm(pt.lat, pt.lon, row.latitude, row.longitude);
      if (d < minDist) minDist = d;
    }
    if (minDist > corridorKm) continue;

    const station = loadStation(row.id);
    if (!station) continue;

    const hasMatching = station.connectors.some(
      (c) =>
        connectorStandards.includes(c.standard) &&
        (c.availability === "Available" || c.availability === "Unknown")
    );
    if (hasMatching) results.push(station);
  }

  return results;
}
