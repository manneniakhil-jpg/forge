import { NextRequest } from "next/server";
import type { TripPlan } from "@ev/domain";
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
  const row = getDb()
    .prepare("SELECT plan_json FROM trip_plans WHERE id = ? AND owner_id = ?")
    .get(id, auth.ownerId) as { plan_json: string } | undefined;

  if (!row) return apiError("NOT_FOUND", "Trip not found", 404);

  const plan = JSON.parse(row.plan_json) as TripPlan;
  return jsonOk({ plan });
}
