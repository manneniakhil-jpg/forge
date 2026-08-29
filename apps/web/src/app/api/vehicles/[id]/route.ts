import { NextRequest } from "next/server";
import { computeRangeKm, validateManualSoc } from "@ev/domain";
import { validateSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const { id } = await params;
  const vehicle = getDb()
    .prepare("SELECT * FROM vehicles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
    .get(id, auth.ownerId) as Record<string, unknown> | undefined;

  if (!vehicle) return apiError("NOT_FOUND", "Vehicle not found", 404);

  const state = getDb()
    .prepare("SELECT * FROM vehicle_states WHERE vehicle_id = ?")
    .get(id) as Record<string, unknown> | undefined;

  return jsonOk({
    state: {
      socPct: state?.soc_pct ?? null,
      rangeKm: state?.range_km ?? null,
      pluggedIn: state?.plugged_in ? true : state?.plugged_in === 0 ? false : null,
      chargingStatus: (state?.charging_status as string) ?? null,
      capturedAt: (state?.captured_at as string) ?? null,
      fieldAvailability: {
        socPct: state?.soc_pct != null,
        rangeKm: state?.range_km != null,
        pluggedIn: state?.plugged_in != null,
        chargingStatus: state?.charging_status != null,
      },
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  const vehicle = db
    .prepare("SELECT * FROM vehicles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
    .get(id, auth.ownerId) as Record<string, unknown> | undefined;

  if (!vehicle) return apiError("NOT_FOUND", "Vehicle not found", 404);

  if (body.action === "setActive") {
    db.prepare("UPDATE accounts SET active_vehicle_id = ? WHERE id = ?").run(id, auth.ownerId);
    return jsonOk({ active: true });
  }

  if (body.socPct !== undefined) {
    if (!validateManualSoc(body.socPct).valid) {
      return apiError("INVALID_SOC", "State of charge must be 0-100", 400);
    }
    const rangeKm = computeRangeKm(
      body.socPct,
      vehicle.battery_kwh as number,
      vehicle.efficiency_wh_km as number
    );
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO vehicle_states (vehicle_id, soc_pct, range_km, plugged_in, charging_status, captured_at)
       VALUES (?, ?, ?, 0, 'idle', ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET soc_pct = ?, range_km = ?, captured_at = ?`
    ).run(id, body.socPct, rangeKm, now, body.socPct, rangeKm, now);

    return jsonOk({ socPct: body.socPct, rangeKm, capturedAt: now });
  }

  return apiError("INVALID_REQUEST", "Unknown action", 400);
}
