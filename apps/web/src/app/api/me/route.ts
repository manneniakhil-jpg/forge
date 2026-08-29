import { NextRequest } from "next/server";
import { getAccount, validateSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

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
