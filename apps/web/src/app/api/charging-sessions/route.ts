import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { validateSession, getAccount } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getStationById } from "@/lib/chargers";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const body = await request.json();
  const { stationId, connectorId } = body;

  const station = getStationById(stationId);
  if (!station) return apiError("NOT_FOUND", "Station not found", 404);

  const connector = station.connectors.find((c) => c.id === connectorId);
  if (!connector) return apiError("NOT_FOUND", "Connector not found", 404);

  if (connector.availability !== "Available") {
    return apiError("CONNECTOR_UNAVAILABLE", `Connector is ${connector.availability}`, 400);
  }

  if (!station.remoteStartSupported) {
    return apiError("NO_REMOTE_START", "Remote start not supported", 400);
  }

  const account = getAccount(auth.ownerId);
  if (!account?.active_vehicle_id) {
    return apiError("NO_ACTIVE_VEHICLE", "No active vehicle", 400);
  }

  const sessionId = uuidv4();
  const now = new Date().toISOString();
  const price = connector.pricePerKwh === "Unknown" ? 0 : connector.pricePerKwh;

  getDb()
    .prepare(
      `INSERT INTO charging_sessions (id, owner_id, vehicle_id, station_id, connector_id, start_ts, status, instantaneous_power_kw, last_refresh_at, cost, currency, cost_state)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, 'UNAVAILABLE')`
    )
    .run(
      sessionId,
      auth.ownerId,
      account.active_vehicle_id,
      stationId,
      connectorId,
      now,
      connector.maxPowerKw * 0.85,
      now,
      connector.currency
    );

  return jsonOk({ sessionId, status: "started" });
}

export async function GET(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const active = getDb()
    .prepare(
      "SELECT * FROM charging_sessions WHERE owner_id = ? AND status = 'active' ORDER BY start_ts DESC LIMIT 1"
    )
    .get(auth.ownerId) as Record<string, unknown> | undefined;

  if (!active) return jsonOk({ session: null });

  const elapsedMs = Date.now() - new Date(active.start_ts as string).getTime();
  const elapsedMin = elapsedMs / 60000;
  const energyKwh = Math.round(((active.instantaneous_power_kw as number) * elapsedMin) / 60 * 100) / 100;
  const price = getStationById(active.station_id as string)?.connectors.find(
    (c) => c.id === active.connector_id
  )?.pricePerKwh;
  const cost = typeof price === "number" ? Math.round(energyKwh * price * 100) / 100 : null;

  getDb()
    .prepare("UPDATE charging_sessions SET energy_kwh = ?, cost = ?, last_refresh_at = ? WHERE id = ?")
    .run(energyKwh, cost, new Date().toISOString(), active.id);

  return jsonOk({
    session: {
      id: active.id,
      stationId: active.station_id,
      connectorId: active.connector_id,
      startTs: active.start_ts,
      energyKwh,
      instantaneousPowerKw: active.instantaneous_power_kw,
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      cost,
      currency: active.currency,
      lastRefreshAt: new Date().toISOString(),
      status: "active",
    },
  });
}
