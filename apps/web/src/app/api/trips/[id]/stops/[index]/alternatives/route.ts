import { NextRequest } from "next/server";
import { validateSession, getAccount } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getStopAlternatives, type TripInput } from "@/lib/trip-planner";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";
import type { ConnectorStandard, TripPlan } from "@ev/domain";

function loadTripPlan(ownerId: string, planId: string): TripPlan | null {
  const row = getDb()
    .prepare("SELECT plan_json FROM trip_plans WHERE id = ? AND owner_id = ?")
    .get(planId, ownerId) as { plan_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.plan_json) as TripPlan;
}

function tripInputForOwner(
  ownerId: string,
  plan: TripPlan,
  departureSocPct: number
): TripInput | { error: string } {
  const account = getAccount(ownerId);
  if (!account?.active_vehicle_id) {
    return { error: "NO_ACTIVE_VEHICLE" };
  }

  const vehicle = getDb()
    .prepare("SELECT * FROM vehicles WHERE id = ?")
    .get(account.active_vehicle_id) as Record<string, unknown> | undefined;
  if (!vehicle) {
    return { error: "NO_ACTIVE_VEHICLE" };
  }

  return {
    origin: plan.origin,
    destination: plan.destination,
    departureSocPct,
    reserveSocPct: plan.reserveSocPct,
    batteryKwh: vehicle.battery_kwh as number,
    efficiencyWhKm: vehicle.efficiency_wh_km as number,
    connectorStandards: JSON.parse(vehicle.connector_standards as string) as ConnectorStandard[],
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const { id, index } = await params;
  const stopIndex = parseInt(index, 10);
  if (Number.isNaN(stopIndex)) {
    return apiError("INVALID_STOP_INDEX", "Stop index must be a number", 400);
  }

  const plan = loadTripPlan(auth.ownerId, id);
  if (!plan) return apiError("PLAN_NOT_FOUND", "Trip plan not found", 404);

  const { searchParams } = new URL(request.url);
  const departureSocPct = parseInt(searchParams.get("departureSocPct") ?? "80", 10);

  const input = tripInputForOwner(auth.ownerId, plan, departureSocPct);
  if ("error" in input) return apiError(input.error, input.error, 400);

  const result = await getStopAlternatives(input, plan, stopIndex);

  if ("error" in result && typeof result.error === "string") {
    if (result.error === "INVALID_STOP_INDEX") {
      return apiError("INVALID_STOP_INDEX", "Invalid stop index", 400);
    }
    return apiError(result.error, result.error, 400);
  }

  return jsonOk(result);
}
