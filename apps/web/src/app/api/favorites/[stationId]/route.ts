import { NextRequest } from "next/server";
import { validateSession } from "@/lib/auth";
import { addFavorite } from "@/lib/chargers";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ stationId: string }> }
) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const { stationId } = await params;
  const ok = addFavorite(auth.ownerId, stationId);
  if (!ok) return apiError("FAVORITE_LIMIT", "Maximum 100 favorites", 400);

  return jsonOk({ favorited: true, stationId });
}
