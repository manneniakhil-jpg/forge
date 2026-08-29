import type Database from "better-sqlite3";
import type { ConnectorStandard } from "@ev/domain";

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

const SF_CHARGERS = [
  { name: "Electrify America", lat: 37.7849, lon: -122.4094, network: "electrify_america", connectors: [{ standard: "CCS" as const, power: 350, price: 0.48 }, { standard: "CHAdeMO" as const, power: 50, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.7955, lon: -122.3937, network: "chargepoint", connectors: [{ standard: "CCS" as const, power: 150, price: 0.35 }, { standard: "Type2" as const, power: 22, price: 0.35 }] },
  { name: "EVgo", lat: 37.7694, lon: -122.4148, network: "evgo", connectors: [{ standard: "CCS" as const, power: 100, price: 0.42 }, { standard: "NACS" as const, power: 250, price: 0.42 }] },
  { name: "Tesla Supercharger", lat: 37.7879, lon: -122.4075, network: "tesla", connectors: [{ standard: "NACS" as const, power: 250, price: 0.32 }] },
  { name: "Electrify America", lat: 37.7599, lon: -122.4148, network: "electrify_america", connectors: [{ standard: "CCS" as const, power: 150, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.8024, lon: -122.4058, network: "chargepoint", connectors: [{ standard: "CCS" as const, power: 62, price: 0.30 }] },
  { name: "EV Connect", lat: 37.7749, lon: -122.4194, network: "ev_connect", connectors: [{ standard: "CCS" as const, power: 50, price: 0.38 }] },
  { name: "Blink", lat: 37.7810, lon: -122.4040, network: "blink", connectors: [{ standard: "CCS" as const, power: 50, price: 0.45 }] },
  { name: "Volta", lat: 37.7900, lon: -122.4000, network: "volta", connectors: [{ standard: "CCS" as const, power: 50, price: 0.00 }] },
  { name: "Electrify America", lat: 37.8080, lon: -122.4177, network: "electrify_america", connectors: [{ standard: "CCS" as const, power: 350, price: 0.48 }, { standard: "NACS" as const, power: 250, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.7500, lon: -122.4300, network: "chargepoint", connectors: [{ standard: "CCS" as const, power: 125, price: 0.35 }] },
  { name: "EVgo", lat: 37.8200, lon: -122.3700, network: "evgo", connectors: [{ standard: "CCS" as const, power: 100, price: 0.42 }] },
  { name: "Tesla Supercharger", lat: 37.7400, lon: -122.4500, network: "tesla", connectors: [{ standard: "NACS" as const, power: 250, price: 0.32 }] },
  { name: "Shell Recharge", lat: 37.7300, lon: -122.3900, network: "shell", connectors: [{ standard: "CCS" as const, power: 150, price: 0.40 }] },
  { name: "Electrify America", lat: 37.8500, lon: -122.2900, network: "electrify_america", connectors: [{ standard: "CCS" as const, power: 350, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.6500, lon: -122.4200, network: "chargepoint", connectors: [{ standard: "CCS" as const, power: 62, price: 0.30 }, { standard: "Type2" as const, power: 22, price: 0.30 }] },
  { name: "EVgo", lat: 37.6000, lon: -122.3800, network: "evgo", connectors: [{ standard: "CCS" as const, power: 100, price: 0.42 }] },
  { name: "Blink", lat: 37.8800, lon: -122.3100, network: "blink", connectors: [{ standard: "CCS" as const, power: 50, price: 0.45 }] },
  { name: "Electrify America", lat: 37.5500, lon: -122.3200, network: "electrify_america", connectors: [{ standard: "CCS" as const, power: 150, price: 0.48 }] },
  { name: "ChargePoint", lat: 37.9200, lon: -122.3500, network: "chargepoint", connectors: [{ standard: "CCS" as const, power: 125, price: 0.35 }] },
];

const AVAILABILITY = ["Available", "Available", "Available", "Occupied", "Unknown"] as const;

export function seedDatabase(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as c FROM charging_stations").get() as { c: number };
  if (count.c > 0) return;

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

  const networks = new Set<string>();

  SF_CHARGERS.forEach((station, idx) => {
    const stationId = `stn_${idx + 1}`;
    networks.add(station.network);
    insertStation.run(
      stationId,
      station.name,
      station.lat,
      station.lon,
      station.network,
      "Public access during business hours",
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
  });

  networks.forEach((n) => insertFeed.run(n, now));
}
