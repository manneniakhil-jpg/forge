import { NextRequest } from "next/server";
import { validateSearchParams, type ConnectorStandard } from "@ev/domain";
import { validateSession } from "@/lib/auth";
import { searchChargers, getFavorites } from "@/lib/chargers";
import { apiError, getAuthHeader, jsonOk } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const auth = validateSession(getAuthHeader(request));
  if ("error" in auth) return apiError(auth.error, "Session expired", 401);

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const radiusKm = parseFloat(searchParams.get("radiusKm") ?? "10");
  const connectorStandard = searchParams.get("connectorStandard") as ConnectorStandard | null;
  const minPowerKw = searchParams.get("minPowerKw")
    ? parseFloat(searchParams.get("minPowerKw")!)
    : undefined;
  const networkId = searchParams.get("networkId") ?? undefined;
  const priceCeiling = searchParams.get("priceCeiling")
    ? parseFloat(searchParams.get("priceCeiling")!)
    : undefined;

  const validation = validateSearchParams({ lat, lon, radiusKm, minPowerKw, priceCeiling });
  if (!validation.valid) {
    return apiError("INVALID_PARAMS", `Invalid ${validation.field}`, 400);
  }

  const { stations, fallbackUsed, regionalDemoAdded } = searchChargers({
    lat,
    lon,
    radiusKm,
    connectorStandard: connectorStandard ?? undefined,
    minPowerKw,
    networkId,
    priceCeiling,
    ownerId: auth.ownerId,
  });

  const favorites = getFavorites(auth.ownerId);
  const favoriteSet = new Set(favorites);

  const sorted = [...stations].sort((a, b) => {
    const aFav = favoriteSet.has(a.id) ? 0 : 1;
    const bFav = favoriteSet.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.distanceKm - b.distanceKm;
  });

  return jsonOk({
    stations: sorted,
    fallbackUsed,
    regionalDemoAdded,
    favorites,
    feedTimestamps: {},
  });
}
