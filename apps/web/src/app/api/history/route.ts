import { NextRequest } from "next/server";
import { validateSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const sessions = getDb()
    .prepare(
      "SELECT * FROM charging_sessions WHERE owner_id = ? AND status = 'completed' ORDER BY start_ts DESC LIMIT 50"
    )
    .all(auth.ownerId) as Array<Record<string, unknown>>;

  const totalEnergy = sessions.reduce((s, r) => s + ((r.energy_kwh as number) || 0), 0);
  const totalCost = sessions.reduce((s, r) => s + ((r.cost as number) || 0), 0);

  return jsonOk({
    sessions: sessions.map((s) => ({
      id: s.id,
      stationId: s.station_id,
      startTs: s.start_ts,
      endTs: s.end_ts,
      energyKwh: s.energy_kwh,
      cost: s.cost,
      currency: s.currency,
      source: s.source,
    })),
    summary: {
      totalEnergyKwh: Math.round(totalEnergy * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      sessionCount: sessions.length,
      avgCostPerKwh:
        totalEnergy > 0 ? Math.round((totalCost / totalEnergy) * 10000) / 10000 : null,
    },
  });
}
