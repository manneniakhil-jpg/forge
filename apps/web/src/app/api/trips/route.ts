import { NextRequest } from "next/server";
import { validateReserveSoc } from "@ev/domain";
import { validateSession, getAccount } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { planTrip } from "@/lib/trip-planner";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";
import type { ConnectorStandard } from "@ev/domain";

export async function POST(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const body = await request.json();
  const { origin, destination, departureSocPct, reserveSocPct } = body;

  if (!origin?.lat || !destination?.lat || !departureSocPct) {
    return apiError("INVALID_TRIP_INPUT", "Missing origin, destination, or departure SoC", 400, {
      input: "origin, destination, or departureSocPct",
    });
  }

  const reserve = reserveSocPct ?? getAccount(auth.ownerId)?.reserve_soc ?? 10;
  if (!validateReserveSoc(reserve).valid) {
    return apiError("INVALID_TRIP_INPUT", "Reserve SoC must be 5-40", 400, { reserveSocPct: "out of range" });
  }

  if (departureSocPct < 1 || departureSocPct > 100) {
    return apiError("INVALID_TRIP_INPUT", "Departure SoC must be 1-100", 400);
  }

  const account = getAccount(auth.ownerId);
  if (!account?.active_vehicle_id) {
    return apiError("NO_ACTIVE_VEHICLE", "Add a vehicle first", 400);
  }

  const vehicle = getDb()
    .prepare("SELECT * FROM vehicles WHERE id = ?")
    .get(account.active_vehicle_id) as Record<string, unknown>;

  const result = await planTrip({
    origin: { lat: origin.lat, lon: origin.lon, label: origin.label ?? "Origin" },
    destination: {
      lat: destination.lat,
      lon: destination.lon,
      label: destination.label ?? "Destination",
    },
    departureSocPct,
    reserveSocPct: reserve,
    batteryKwh: vehicle.battery_kwh as number,
    efficiencyWhKm: vehicle.efficiency_wh_km as number,
    connectorStandards: JSON.parse(vehicle.connector_standards as string) as ConnectorStandard[],
  });

  if ("error" in result) {
    return apiError(result.error, result.error, 400, result.details as Record<string, string>);
  }

  getDb()
    .prepare("INSERT INTO trip_plans (id, owner_id, plan_json, created_at) VALUES (?, ?, ?, ?)")
    .run(result.id, auth.ownerId, JSON.stringify(result), new Date().toISOString());

  return jsonOk({ plan: result });
}
