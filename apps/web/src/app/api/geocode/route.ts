import { NextRequest } from "next/server";
import {
  geocodeSuggestions,
  resolveGeocodeSuggestion,
  resolvePlaceId,
} from "@/lib/geocoding";
import { apiError, jsonOk } from "@/lib/api-helpers";

function parseBias(request: NextRequest): { lat: number; lon: number } | undefined {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon };
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId");

  if (placeId) {
    const result = await resolvePlaceId(placeId);
    if (!result) {
      return apiError("PLACE_NOT_FOUND", "Could not resolve that place", 404);
    }
    return jsonOk({ result });
  }

  const q = searchParams.get("q") ?? "";

  if (q.trim().length < 2) {
    return apiError("INVALID_QUERY", "Enter at least 2 characters", 400);
  }
  if (q.length > 200) {
    return apiError("INVALID_QUERY", "Place name must be 200 characters or less", 400);
  }

  const bias = parseBias(request);
  const results = await geocodeSuggestions(q, bias);
  return jsonOk({
    results,
    provider: results.some((r) => r.placeId) ? "google_places" : "nominatim",
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const suggestion = body.suggestion;

  if (!suggestion?.label) {
    return apiError("INVALID_INPUT", "Suggestion is required", 400);
  }

  const result = await resolveGeocodeSuggestion(suggestion);
  if (!result) {
    return apiError("PLACE_NOT_FOUND", "Could not resolve that place", 404);
  }

  return jsonOk({ result });
}
