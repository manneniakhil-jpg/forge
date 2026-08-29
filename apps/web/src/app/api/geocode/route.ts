import { NextRequest } from "next/server";
import { geocodePlace } from "@/lib/geocoding";
import { apiError, jsonOk } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q") ?? "";

  if (q.trim().length < 1) {
    return apiError("INVALID_QUERY", "Enter a place name", 400);
  }
  if (q.length > 200) {
    return apiError("INVALID_QUERY", "Place name must be 200 characters or less", 400);
  }

  const results = await geocodePlace(q);
  return jsonOk({ results });
}
