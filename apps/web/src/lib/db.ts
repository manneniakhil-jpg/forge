import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { seedDatabase } from "./seed";
import { ensureH3Index } from "./station-store";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ev-companion.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  seedDatabase(db);
  ensureH3Index();

  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email_lower TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      time_zone TEXT DEFAULT 'America/Los_Angeles',
      distance_unit TEXT DEFAULT 'mi',
      reserve_soc INTEGER DEFAULT 10,
      active_vehicle_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      email_lower TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0,
      locked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      battery_kwh REAL NOT NULL,
      connector_standards TEXT NOT NULL,
      efficiency_wh_km REAL NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (owner_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS vehicle_states (
      vehicle_id TEXT PRIMARY KEY,
      soc_pct INTEGER,
      range_km REAL,
      plugged_in INTEGER,
      charging_status TEXT,
      captured_at TEXT,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS charging_stations (
      id TEXT PRIMARY KEY,
      operator_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      network_id TEXT NOT NULL,
      access_rules TEXT,
      remote_start INTEGER DEFAULT 0,
      last_feed_update TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      standard TEXT NOT NULL,
      max_power_kw REAL NOT NULL,
      availability TEXT NOT NULL,
      price_per_kwh REAL,
      currency TEXT DEFAULT 'USD',
      FOREIGN KEY (station_id) REFERENCES charging_stations(id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      owner_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, station_id)
    );

    CREATE TABLE IF NOT EXISTS charging_sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      start_ts TEXT NOT NULL,
      end_ts TEXT,
      energy_kwh REAL DEFAULT 0,
      peak_kw REAL,
      cost REAL,
      currency TEXT DEFAULT 'USD',
      cost_state TEXT DEFAULT 'UNAVAILABLE',
      source TEXT DEFAULT 'NETWORK',
      status TEXT DEFAULT 'active',
      instantaneous_power_kw REAL,
      last_refresh_at TEXT,
      FOREIGN KEY (owner_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS trip_plans (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS feed_health (
      network_id TEXT PRIMARY KEY,
      last_success_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS h3_cell_stations (
      h3_index TEXT NOT NULL,
      station_id TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      PRIMARY KEY (h3_index, station_id),
      FOREIGN KEY (station_id) REFERENCES charging_stations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_h3_cell_stations_h3 ON h3_cell_stations(h3_index);
  `);
}
