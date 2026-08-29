import type Database from "better-sqlite3";
import type { ConnectorStandard, VehicleKind } from "@ev/domain";
import { cellForCoordinates } from "./h3-index";

type CatalogEntry = {
  kind: VehicleKind;
  make: string;
  model: string;
  year: number;
  batteryKwh: number;
  connectorStandards: ConnectorStandard[];
  efficiencyWhKm: number;
};

export const CAR_CATALOG: CatalogEntry[] = [
  { kind: "car", make: "Tesla", model: "Model 3 Long Range", year: 2024, batteryKwh: 82, connectorStandards: ["NACS"], efficiencyWhKm: 145 },
  { kind: "car", make: "Tesla", model: "Model Y", year: 2024, batteryKwh: 75, connectorStandards: ["NACS"], efficiencyWhKm: 155 },
  { kind: "car", make: "Ford", model: "Mustang Mach-E", year: 2024, batteryKwh: 91, connectorStandards: ["CCS"], efficiencyWhKm: 180 },
  { kind: "car", make: "Chevrolet", model: "Bolt EUV", year: 2023, batteryKwh: 65, connectorStandards: ["CCS"], efficiencyWhKm: 160 },
  { kind: "car", make: "Hyundai", model: "Ioniq 5", year: 2024, batteryKwh: 77, connectorStandards: ["CCS"], efficiencyWhKm: 170 },
  { kind: "car", make: "Rivian", model: "R1T", year: 2024, batteryKwh: 135, connectorStandards: ["CCS"], efficiencyWhKm: 220 },
  { kind: "car", make: "BMW", model: "i4", year: 2024, batteryKwh: 81, connectorStandards: ["CCS"], efficiencyWhKm: 165 },
  { kind: "car", make: "Nissan", model: "Leaf", year: 2023, batteryKwh: 62, connectorStandards: ["CHAdeMO", "Type2"], efficiencyWhKm: 175 },
];

export const BIKE_CATALOG: CatalogEntry[] = [
  { kind: "bike", make: "Rad Power", model: "RadRunner 3 Plus", year: 2024, batteryKwh: 0.75, connectorStandards: ["Type2"], efficiencyWhKm: 12 },
  { kind: "bike", make: "Trek", model: "Allant+ 7", year: 2024, batteryKwh: 0.625, connectorStandards: ["Type2"], efficiencyWhKm: 10 },
  { kind: "bike", make: "Specialized", model: "Turbo Vado 5", year: 2024, batteryKwh: 0.71, connectorStandards: ["Type2"], efficiencyWhKm: 11 },
  { kind: "bike", make: "VanMoof", model: "S5", year: 2024, batteryKwh: 0.504, connectorStandards: ["Type2"], efficiencyWhKm: 9 },
  { kind: "bike", make: "Super73", model: "ZX", year: 2024, batteryKwh: 0.96, connectorStandards: ["Type2"], efficiencyWhKm: 15 },
  { kind: "bike", make: "Lectric", model: "XP 3.0", year: 2024, batteryKwh: 0.672, connectorStandards: ["Type2"], efficiencyWhKm: 13 },
];

export const VEHICLE_CATALOG: CatalogEntry[] = [...CAR_CATALOG, ...BIKE_CATALOG];

type SeedStation = {
  name: string;
  lat: number;
  lon: number;
  network: string;
  connectors: Array<{ standard: ConnectorStandard; power: number; price: number }>;
};

const SF_CHARGERS: SeedStation[] = [
  { name: "Electrify America", lat: 37.7849, lon: -122.4094, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.7955, lon: -122.3937, network: "chargepoint", connectors: [{ standard: "CCS", power: 150, price: 0.35 }, { standard: "Type2", power: 7.2, price: 0.28 }] },
  { name: "EVgo", lat: 37.7694, lon: -122.4148, network: "evgo", connectors: [{ standard: "CCS", power: 100, price: 0.42 }, { standard: "NACS", power: 250, price: 0.42 }] },
  { name: "Tesla Supercharger", lat: 37.7879, lon: -122.4075, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Electrify America", lat: 37.7599, lon: -122.4148, network: "electrify_america", connectors: [{ standard: "CCS", power: 150, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.8024, lon: -122.4058, network: "chargepoint", connectors: [{ standard: "CCS", power: 62, price: 0.30 }, { standard: "Type2", power: 7.2, price: 0.28 }] },
  { name: "EV Connect", lat: 37.7749, lon: -122.4194, network: "ev_connect", connectors: [{ standard: "CCS", power: 50, price: 0.38 }, { standard: "Type2", power: 7.2, price: 0.32 }] },
  { name: "Volta", lat: 37.7900, lon: -122.4000, network: "volta", connectors: [{ standard: "CCS", power: 50, price: 0.00 }, { standard: "Type2", power: 7.2, price: 0.00 }] },
  { name: "Tesla Supercharger", lat: 37.7400, lon: -122.4500, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Shell Recharge", lat: 37.7300, lon: -122.3900, network: "shell", connectors: [{ standard: "CCS", power: 150, price: 0.40 }, { standard: "NACS", power: 150, price: 0.40 }] },
];

/** Stations along major CA driving corridors (I-5, US-101, I-80) for trip planning */
const CORRIDOR_CHARGERS: SeedStation[] = [
  { name: "Electrify America — Sacramento", lat: 38.5816, lon: -121.4944, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "ChargePoint — Vallejo", lat: 38.1041, lon: -122.2566, network: "chargepoint", connectors: [{ standard: "CCS", power: 125, price: 0.35 }, { standard: "NACS", power: 150, price: 0.35 }, { standard: "Type2", power: 7.2, price: 0.28 }] },
  { name: "Tesla Supercharger — Gilroy", lat: 37.0058, lon: -121.5683, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Electrify America — Coalinga", lat: 36.1397, lon: -120.3601, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Electrify America — Kettleman City", lat: 36.0080, lon: -119.9618, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "EVgo — Fresno", lat: 36.7378, lon: -119.7871, network: "evgo", connectors: [{ standard: "CCS", power: 100, price: 0.42 }, { standard: "NACS", power: 200, price: 0.42 }] },
  { name: "Electrify America — Bakersfield", lat: 35.3733, lon: -119.0187, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Tesla Supercharger — Grapevine", lat: 34.9980, lon: -118.9380, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Electrify America — Santa Clarita", lat: 34.3917, lon: -118.5426, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Electrify America — Los Angeles", lat: 34.0522, lon: -118.2437, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "EVgo — San Diego", lat: 32.7157, lon: -117.1611, network: "evgo", connectors: [{ standard: "CCS", power: 100, price: 0.42 }, { standard: "NACS", power: 200, price: 0.42 }] },
  { name: "ChargePoint — Monterey", lat: 36.6002, lon: -121.8947, network: "chargepoint", connectors: [{ standard: "CCS", power: 125, price: 0.35 }, { standard: "NACS", power: 150, price: 0.35 }, { standard: "Type2", power: 7.2, price: 0.28 }] },
  { name: "Electrify America — San Luis Obispo", lat: 35.2828, lon: -120.6596, network: "electrify_america", connectors: [{ standard: "CCS", power: 150, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Tesla Supercharger — Stockton", lat: 37.9577, lon: -121.2908, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "ChargePoint — Oakland", lat: 37.8044, lon: -122.2712, network: "chargepoint", connectors: [{ standard: "CCS", power: 125, price: 0.35 }, { standard: "NACS", power: 150, price: 0.35 }, { standard: "Type2", power: 7.2, price: 0.28 }] },
];

const AVAILABILITY = ["Available", "Available", "Available", "Occupied", "Unknown"] as const;

function insertStationList(
  db: Database.Database,
  stations: SeedStation[],
  idPrefix: string,
  skipExisting = false
) {
  const now = new Date().toISOString();
  const insertStation = db.prepare(`
    INSERT INTO charging_stations (id, operator_name, latitude, longitude, network_id, access_rules, remote_start, last_feed_update)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertConnector = db.prepare(`
    INSERT INTO connectors (id, station_id, standard, max_power_kw, availability, price_per_kwh, currency)
    VALUES (?, ?, ?, ?, ?, ?, 'USD')
  `);
  const insertFeed = db.prepare(`
    INSERT OR IGNORE INTO feed_health (network_id, last_success_at) VALUES (?, ?)
  `);
  const insertH3 = db.prepare(`
    INSERT OR REPLACE INTO h3_cell_stations (h3_index, station_id, indexed_at) VALUES (?, ?, ?)
  `);
  const existsStmt = db.prepare(`SELECT id FROM charging_stations WHERE id = ?`);

  stations.forEach((station, idx) => {
    const stationId = `${idPrefix}_${idx + 1}`;
    if (skipExisting && existsStmt.get(stationId)) return;

    insertStation.run(
      stationId,
      station.name,
      station.lat,
      station.lon,
      station.network,
      "Public access 24/7",
      station.network === "tesla" || station.network === "electrify_america" ? 1 : 0,
      now
    );
    station.connectors.forEach((conn, cIdx) => {
      insertConnector.run(
        `${stationId}_c${cIdx}`,
        stationId,
        conn.standard,
        conn.power,
        AVAILABILITY[Math.floor(Math.random() * AVAILABILITY.length)],
        conn.price
      );
    });
    insertFeed.run(station.network, now);
    insertH3.run(cellForCoordinates(station.lat, station.lon), stationId, now);
  });
}

export function seedDatabase(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as c FROM charging_stations").get() as { c: number };
  if (count.c === 0) {
    insertStationList(db, SF_CHARGERS, "stn");
  }
  insertStationList(db, CORRIDOR_CHARGERS, "stn_c", true);
}

/** ~1 decimal degree ≈ 11 km — one demo cluster per region */
function regionKey(lat: number, lon: number): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${r(lat)}_${r(lon)}`.replace(".", "p").replace("-", "n");
}

const NEARBY_DEMO_STATIONS: Array<{
  name: string;
  network: string;
  bearingDeg: number;
  distanceKm: number;
  connectors: SeedStation["connectors"];
}> = [
  {
    name: "ChargePoint — Nearby",
    network: "chargepoint",
    bearingDeg: 0,
    distanceKm: 2.5,
    connectors: [
      { standard: "CCS", power: 150, price: 0.35 },
      { standard: "NACS", power: 150, price: 0.35 },
      { standard: "Type2", power: 7.2, price: 0.28 },
    ],
  },
  {
    name: "Electrify America — Nearby",
    network: "electrify_america",
    bearingDeg: 72,
    distanceKm: 4,
    connectors: [
      { standard: "CCS", power: 350, price: 0.48 },
      { standard: "NACS", power: 250, price: 0.48 },
    ],
  },
  {
    name: "EVgo — Nearby",
    network: "evgo",
    bearingDeg: 144,
    distanceKm: 3,
    connectors: [
      { standard: "CCS", power: 100, price: 0.42 },
      { standard: "NACS", power: 200, price: 0.42 },
    ],
  },
  {
    name: "Tesla Supercharger — Nearby",
    network: "tesla",
    bearingDeg: 216,
    distanceKm: 5.5,
    connectors: [{ standard: "NACS", power: 250, price: 0.32 }],
  },
  {
    name: "Shell Recharge — Nearby",
    network: "shell",
    bearingDeg: 288,
    distanceKm: 3.5,
    connectors: [
      { standard: "CCS", power: 150, price: 0.4 },
      { standard: "NACS", power: 150, price: 0.4 },
    ],
  },
];

function offsetPoint(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDeg: number
): { lat: number; lon: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceKm * Math.cos(rad)) / 111;
  const dLon = (distanceKm * Math.sin(rad)) / (111 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Add demo chargers near the user when our CA seed set has nothing within 250 km. */
export function seedStationsNearPoint(db: Database.Database, lat: number, lon: number): boolean {
  const key = regionKey(lat, lon);
  const prefix = `stn_near_${key}`;
  const exists = db
    .prepare("SELECT id FROM charging_stations WHERE id LIKE ? LIMIT 1")
    .get(`${prefix}%`) as { id: string } | undefined;
  if (exists) return false;

  const stations: SeedStation[] = NEARBY_DEMO_STATIONS.map((template) => {
    const point = offsetPoint(lat, lon, template.distanceKm, template.bearingDeg);
    return {
      name: template.name,
      lat: point.lat,
      lon: point.lon,
      network: template.network,
      connectors: template.connectors,
    };
  });

  insertStationList(db, stations, prefix, false);
  return true;
}
