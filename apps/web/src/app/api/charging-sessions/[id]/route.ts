import { NextRequest } from "next/server";
import { validateSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const { id } = await params;
  const session = getDb()
    .prepare("SELECT * FROM charging_sessions WHERE id = ? AND owner_id = ? AND status = 'active'")
    .get(id, auth.ownerId) as Record<string, unknown> | undefined;

  if (!session) return apiError("NOT_FOUND", "Session not found", 404);

  const now = new Date().toISOString();
  getDb()
    .prepare(
      "UPDATE charging_sessions SET status = 'completed', end_ts = ?, cost_state = 'NETWORK' WHERE id = ?"
    )
    .run(now, id);

  return jsonOk({ stopped: true, endTs: now });
}
