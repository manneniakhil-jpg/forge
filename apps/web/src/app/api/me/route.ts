import { NextRequest } from "next/server";
import { validateReserveSoc } from "@ev/domain";
import { getAccount, validateSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

const DISTANCE_UNITS = new Set(["km", "mi"]);

export async function GET(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const account = getAccount(auth.ownerId);
  if (!account) return apiError("SESSION_EXPIRED", "Session expired", 401);

  let activeVehicle = null;
  if (account.active_vehicle_id) {
    const v = getDb()
      .prepare("SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL")
      .get(account.active_vehicle_id) as Record<string, unknown> | undefined;
    if (v) {
      activeVehicle = {
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        batteryKwh: v.battery_kwh,
        connectorStandards: JSON.parse(v.connector_standards as string),
        efficiencyWhKm: v.efficiency_wh_km,
      };
    }
  }

  return jsonOk({
    account: {
      id: account.id,
      email: account.email,
      timeZone: account.time_zone,
      distanceUnit: account.distance_unit,
      reserveSoc: account.reserve_soc,
      activeVehicleId: account.active_vehicle_id,
    },
    activeVehicle,
  });
}

export async function PUT(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const account = getAccount(auth.ownerId);
  if (!account) return apiError("SESSION_EXPIRED", "Session expired", 401);

  const body = await request.json();
  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (body.distanceUnit !== undefined) {
    if (!DISTANCE_UNITS.has(body.distanceUnit)) {
      return apiError("INVALID_DISTANCE_UNIT", "Distance unit must be km or mi", 400);
    }
    updates.push("distance_unit = ?");
    values.push(body.distanceUnit);
  }

  if (body.reserveSoc !== undefined) {
    const reserve = Number(body.reserveSoc);
    if (!validateReserveSoc(reserve).valid) {
      return apiError("INVALID_RESERVE_SOC", "Reserve SoC must be 5-40", 400);
    }
    updates.push("reserve_soc = ?");
    values.push(reserve);
  }

  if (body.timeZone !== undefined) {
    const tz = String(body.timeZone).trim();
    if (tz.length < 3 || tz.length > 64) {
      return apiError("INVALID_TIME_ZONE", "Invalid time zone", 400);
    }
    updates.push("time_zone = ?");
    values.push(tz);
  }

  if (updates.length === 0) {
    return apiError("INVALID_REQUEST", "No settings to update", 400);
  }

  values.push(auth.ownerId);
  getDb()
    .prepare(`UPDATE accounts SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values);

  const updated = getAccount(auth.ownerId)!;
  return jsonOk({
    account: {
      id: updated.id,
      email: updated.email,
      timeZone: updated.time_zone,
      distanceUnit: updated.distance_unit,
      reserveSoc: updated.reserve_soc,
      activeVehicleId: updated.active_vehicle_id,
    },
  });
}
