import type Database from "better-sqlite3";
import type { ConnectorStandard } from "@ev/domain";

type SeedStation = {
  name: string;
  lat: number;
  lon: number;
  network: string;
  connectors: Array<{ standard: ConnectorStandard; power: number; price: number }>;
};

export const VEHICLE_CATALOG: Array<{
  make: string;
  model: string;
  year: number;
  batteryKwh: number;
  connectorStandards: ConnectorStandard[];
  efficiencyWhKm: number;
}> = [
  { make: "Tesla", model: "Model 3 Long Range", year: 2024, batteryKwh: 82, connectorStandards: ["NACS"], efficiencyWhKm: 145 },
  { make: "Tesla", model: "Model Y", year: 2024, batteryKwh: 75, connectorStandards: ["NACS"], efficiencyWhKm: 155 },
  { make: "Ford", model: "Mustang Mach-E", year: 2024, batteryKwh: 91, connectorStandards: ["CCS"], efficiencyWhKm: 180 },
  { make: "Chevrolet", model: "Bolt EUV", year: 2023, batteryKwh: 65, connectorStandards: ["CCS"], efficiencyWhKm: 160 },
  { make: "Hyundai", model: "Ioniq 5", year: 2024, batteryKwh: 77, connectorStandards: ["CCS"], efficiencyWhKm: 170 },
  { make: "Rivian", model: "R1T", year: 2024, batteryKwh: 135, connectorStandards: ["CCS"], efficiencyWhKm: 220 },
  { make: "BMW", model: "i4", year: 2024, batteryKwh: 81, connectorStandards: ["CCS"], efficiencyWhKm: 165 },
  { make: "Nissan", model: "Leaf", year: 2023, batteryKwh: 62, connectorStandards: ["CHAdeMO", "Type2"], efficiencyWhKm: 175 },
];

const SF_CHARGERS: SeedStation[] = [
  { name: "Electrify America", lat: 37.7849, lon: -122.4094, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.7955, lon: -122.3937, network: "chargepoint", connectors: [{ standard: "CCS", power: 150, price: 0.35 }] },
  { name: "EVgo", lat: 37.7694, lon: -122.4148, network: "evgo", connectors: [{ standard: "CCS", power: 100, price: 0.42 }, { standard: "NACS", power: 250, price: 0.42 }] },
  { name: "Tesla Supercharger", lat: 37.7879, lon: -122.4075, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Electrify America", lat: 37.7599, lon: -122.4148, network: "electrify_america", connectors: [{ standard: "CCS", power: 150, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.8024, lon: -122.4058, network: "chargepoint", connectors: [{ standard: "CCS", power: 62, price: 0.30 }] },
  { name: "EV Connect", lat: 37.7749, lon: -122.4194, network: "ev_connect", connectors: [{ standard: "CCS", power: 50, price: 0.38 }] },
  { name: "Volta", lat: 37.7900, lon: -122.4000, network: "volta", connectors: [{ standard: "CCS", power: 50, price: 0.00 }] },
  { name: "Tesla Supercharger", lat: 37.7400, lon: -122.4500, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Shell Recharge", lat: 37.7300, lon: -122.3900, network: "shell", connectors: [{ standard: "CCS", power: 150, price: 0.40 }, { standard: "NACS", power: 150, price: 0.40 }] },
];

/** Stations along major CA driving corridors (I-5, US-101, I-80) for trip planning */
const CORRIDOR_CHARGERS: SeedStation[] = [
  { name: "Electrify America — Sacramento", lat: 38.5816, lon: -121.4944, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "ChargePoint — Vallejo", lat: 38.1041, lon: -122.2566, network: "chargepoint", connectors: [{ standard: "CCS", power: 125, price: 0.35 }, { standard: "NACS", power: 150, price: 0.35 }] },
  { name: "Tesla Supercharger — Gilroy", lat: 37.0058, lon: -121.5683, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Electrify America — Coalinga", lat: 36.1397, lon: -120.3601, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Electrify America — Kettleman City", lat: 36.0080, lon: -119.9618, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "EVgo — Fresno", lat: 36.7378, lon: -119.7871, network: "evgo", connectors: [{ standard: "CCS", power: 100, price: 0.42 }, { standard: "NACS", power: 200, price: 0.42 }] },
  { name: "Electrify America — Bakersfield", lat: 35.3733, lon: -119.0187, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Tesla Supercharger — Grapevine", lat: 34.9980, lon: -118.9380, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "Electrify America — Santa Clarita", lat: 34.3917, lon: -118.5426, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Electrify America — Los Angeles", lat: 34.0522, lon: -118.2437, network: "electrify_america", connectors: [{ standard: "CCS", power: 350, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "EVgo — San Diego", lat: 32.7157, lon: -117.1611, network: "evgo", connectors: [{ standard: "CCS", power: 100, price: 0.42 }, { standard: "NACS", power: 200, price: 0.42 }] },
  { name: "ChargePoint — Monterey", lat: 36.6002, lon: -121.8947, network: "chargepoint", connectors: [{ standard: "CCS", power: 125, price: 0.35 }, { standard: "NACS", power: 150, price: 0.35 }] },
  { name: "Electrify America — San Luis Obispo", lat: 35.2828, lon: -120.6596, network: "electrify_america", connectors: [{ standard: "CCS", power: 150, price: 0.48 }, { standard: "NACS", power: 250, price: 0.48 }] },
  { name: "Tesla Supercharger — Stockton", lat: 37.9577, lon: -121.2908, network: "tesla", connectors: [{ standard: "NACS", power: 250, price: 0.32 }] },
  { name: "ChargePoint — Oakland", lat: 37.8044, lon: -122.2712, network: "chargepoint", connectors: [{ standard: "CCS", power: 125, price: 0.35 }, { standard: "NACS", power: 150, price: 0.35 }] },
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
  });
}

export function seedDatabase(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as c FROM charging_stations").get() as { c: number };
  if (count.c === 0) {
    insertStationList(db, SF_CHARGERS, "stn");
  }
  insertStationList(db, CORRIDOR_CHARGERS, "stn_c", true);
}
