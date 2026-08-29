import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  validateBatteryCapacity,
  validateConnectors,
  validateEfficiency,
  computeRangeKm,
  type ConnectorStandard,
  type VehicleKind,
} from "@ev/domain";
import { validateSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { VEHICLE_CATALOG } from "@/lib/seed";
import { resolveVehicleKind } from "@/lib/vehicle-kind";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

function parseKind(value: unknown): VehicleKind {
  return value === "bike" ? "bike" : "car";
}

export async function GET(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const vehicles = getDb()
    .prepare("SELECT * FROM vehicles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC")
    .all(auth.ownerId) as Array<Record<string, unknown>>;

  return jsonOk({
    vehicles: vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      vehicleKind: resolveVehicleKind({
        vehicleKind: v.vehicle_kind as string | undefined,
        batteryKwh: v.battery_kwh as number,
        efficiencyWhKm: v.efficiency_wh_km as number,
      }),
      batteryKwh: v.battery_kwh,
      connectorStandards: JSON.parse(v.connector_standards as string),
      efficiencyWhKm: v.efficiency_wh_km,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const body = await request.json();
  const db = getDb();
  const vehicleKind = parseKind(body.vehicleKind);

  const count = db
    .prepare("SELECT COUNT(*) as c FROM vehicles WHERE owner_id = ? AND deleted_at IS NULL")
    .get(auth.ownerId) as { c: number };
  if (count.c >= 5) return apiError("VEHICLE_LIMIT_REACHED", "Maximum 5 vehicles", 400);

  let { make, model, year, batteryKwh, connectorStandards, efficiencyWhKm } = body;

  const catalogEntry = VEHICLE_CATALOG.find(
    (v) =>
      v.kind === vehicleKind &&
      v.make.toLowerCase() === (make ?? "").toLowerCase() &&
      v.model.toLowerCase() === (model ?? "").toLowerCase() &&
      v.year === year
  );

  if (catalogEntry && !body.manual) {
    batteryKwh = catalogEntry.batteryKwh;
    connectorStandards = catalogEntry.connectorStandards;
    efficiencyWhKm = catalogEntry.efficiencyWhKm;
  }

  const fields: Record<string, string> = {};
  if (!validateBatteryCapacity(batteryKwh, vehicleKind).valid) {
    fields.batteryKwh = "BATTERY_CAPACITY_OUT_OF_RANGE";
  }
  if (!validateConnectors(connectorStandards ?? []).valid) {
    fields.connectorStandards = "Invalid connector count";
  }
  if (!validateEfficiency(efficiencyWhKm, vehicleKind).valid) {
    fields.efficiencyWhKm = "Out of range for vehicle type";
  }

  if (Object.keys(fields).length > 0) {
    return apiError("VALIDATION_ERROR", "Invalid vehicle profile", 400, fields);
  }

  const vehicleId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO vehicles (id, owner_id, make, model, year, battery_kwh, connector_standards, efficiency_wh_km, vehicle_kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    vehicleId,
    auth.ownerId,
    make,
    model,
    year,
    batteryKwh,
    JSON.stringify(connectorStandards),
    efficiencyWhKm,
    vehicleKind,
    now
  );

  const initialSoc = 72;
  const rangeKm = computeRangeKm(initialSoc, batteryKwh, efficiencyWhKm);
  db.prepare(
    `INSERT INTO vehicle_states (vehicle_id, soc_pct, range_km, plugged_in, charging_status, captured_at)
     VALUES (?, ?, ?, 0, 'idle', ?)`
  ).run(vehicleId, initialSoc, rangeKm, now);

  if (count.c === 0) {
    db.prepare("UPDATE accounts SET active_vehicle_id = ? WHERE id = ?").run(vehicleId, auth.ownerId);
  }

  return jsonOk(
    {
      vehicle: {
        id: vehicleId,
        make,
        model,
        year,
        vehicleKind,
        batteryKwh,
        connectorStandards,
        efficiencyWhKm,
      },
    },
    201
  );
}
