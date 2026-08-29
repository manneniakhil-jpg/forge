import type { GeocodeResult } from "./geocoding";

const AUTocomplete_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_URL = "https://places.googleapis.com/v1/places";

export type PlaceSuggestion = {
  placeId: string;
  label: string;
  subtitle?: string;
};

export function isGoogleGeocodingConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export async function googleAutocompleteSuggestions(
  query: string,
  bias?: { lat: number; lon: number }
): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return [];

  const body: Record<string, unknown> = {
    input: query,
  };

  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lon },
        radius: 50000,
      },
    };
  }

  const res = await fetch(AUTocomplete_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[geocode] Google Autocomplete error:", res.status, detail.slice(0, 200));
    return [];
  }

  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  const suggestions: PlaceSuggestion[] = [];
  for (const item of data.suggestions ?? []) {
    const prediction = item.placePrediction;
    if (!prediction?.placeId) continue;

    const main = prediction.structuredFormat?.mainText?.text;
    const secondary = prediction.structuredFormat?.secondaryText?.text;
    const label = main ?? prediction.text?.text ?? "";
    if (!label) continue;

    suggestions.push({
      placeId: prediction.placeId,
      label,
      subtitle: secondary,
    });
  }

  return suggestions.slice(0, 8);
}

export async function googlePlaceDetails(placeId: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(`${PLACE_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.error("[geocode] Google Place details error:", res.status);
    return null;
  }

  const place = (await res.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };

  const lat = place.location?.latitude;
  const lon = place.location?.longitude;
  if (lat == null || lon == null) return null;

  const label =
    place.formattedAddress ??
    place.displayName?.text ??
    `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  return { label, lat, lon, placeId };
}
