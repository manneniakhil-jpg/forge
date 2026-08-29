import { getDb } from "./db";
import { cellForCoordinates, coveringCellIndexes } from "./h3-index";
import {
  haversineKm,
  resolveAvailability,
  type AvailabilityStatus,
  type ChargingStation,
  type ConnectorStandard,
} from "@ev/domain";

export function loadStation(stationId: string): ChargingStation | null {
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

export function indexStationInH3(stationId: string, lat: number, lon: number): void {
  const db = getDb();
  const h3Index = cellForCoordinates(lat, lon);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO h3_cell_stations (h3_index, station_id, indexed_at) VALUES (?, ?, ?)`
  ).run(h3Index, stationId, now);
}

export function rebuildH3Index(): void {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, latitude, longitude FROM charging_stations")
    .all() as Array<{ id: string; latitude: number; longitude: number }>;

  const insert = db.prepare(
    `INSERT OR REPLACE INTO h3_cell_stations (h3_index, station_id, indexed_at) VALUES (?, ?, ?)`
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM h3_cell_stations").run();
    for (const row of rows) {
      insert.run(cellForCoordinates(row.latitude, row.longitude), row.id, now);
    }
  });
  tx();
}

export function ensureH3Index(): void {
  const db = getDb();
  const indexed = db.prepare("SELECT COUNT(*) as c FROM h3_cell_stations").get() as { c: number };
  const stations = db.prepare("SELECT COUNT(*) as c FROM charging_stations").get() as { c: number };
  if (stations.c > 0 && indexed.c === 0) {
    rebuildH3Index();
  }
}

export function upsertStation(station: ChargingStation): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO charging_stations (id, operator_name, latitude, longitude, network_id, access_rules, remote_start, last_feed_update)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       operator_name = excluded.operator_name,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       network_id = excluded.network_id,
       access_rules = excluded.access_rules,
       remote_start = excluded.remote_start,
       last_feed_update = excluded.last_feed_update`
  ).run(
    station.id,
    station.operatorName,
    station.latitude,
    station.longitude,
    station.networkId,
    station.accessRules,
    station.remoteStartSupported ? 1 : 0,
    station.lastFeedUpdate || now
  );

  db.prepare("DELETE FROM connectors WHERE station_id = ?").run(station.id);
  const insertConnector = db.prepare(
    `INSERT INTO connectors (id, station_id, standard, max_power_kw, availability, price_per_kwh, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const connector of station.connectors) {
    insertConnector.run(
      connector.id,
      station.id,
      connector.standard,
      connector.maxPowerKw,
      connector.availability,
      connector.pricePerKwh === "Unknown" ? null : connector.pricePerKwh,
      connector.currency
    );
  }

  db.prepare(
    `INSERT OR IGNORE INTO feed_health (network_id, last_success_at) VALUES (?, ?)`
  ).run(station.networkId, station.lastFeedUpdate || now);

  indexStationInH3(station.id, station.latitude, station.longitude);
}

export function getStationIdsInCells(cellIndexes: string[]): string[] {
  if (cellIndexes.length === 0) return [];
  const db = getDb();
  const placeholders = cellIndexes.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT DISTINCT station_id FROM h3_cell_stations WHERE h3_index IN (${placeholders})`)
    .all(...cellIndexes) as Array<{ station_id: string }>;
  return rows.map((r) => r.station_id);
}

export function searchStationsInRadius(
  lat: number,
  lon: number,
  radiusKm: number
): Array<ChargingStation & { distanceKm: number }> {
  ensureH3Index();
  const cells = coveringCellIndexes(lat, lon, radiusKm);
  const stationIds = getStationIdsInCells(cells);
  const results: Array<ChargingStation & { distanceKm: number }> = [];

  for (const stationId of stationIds) {
    const station = loadStation(stationId);
    if (!station) continue;
    const distanceKm = haversineKm(lat, lon, station.latitude, station.longitude);
    if (distanceKm <= radiusKm + 2) {
      results.push({ ...station, distanceKm });
    }
  }

  return results.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.operatorName.localeCompare(b.operatorName);
  });
}
