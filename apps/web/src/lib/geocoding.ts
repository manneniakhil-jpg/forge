import { haversineKm } from "@ev/domain";
import {
  googleAutocompleteSuggestions,
  googlePlaceDetails,
  isGoogleGeocodingConfigured,
} from "./google-geocoding";

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  placeId?: string;
  subtitle?: string;
}

export type GeocodeSuggestion = {
  label: string;
  lat?: number;
  lon?: number;
  placeId?: string;
  subtitle?: string;
};

function shortenNominatimLabel(displayName: string): string {
  const parts = displayName.split(",").map((p) => p.trim());
  if (parts.length <= 3) return displayName;
  return parts.slice(0, 3).join(", ");
}

async function nominatimSearch(
  query: string,
  bias?: { lat: number; lon: number }
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: "json",
    limit: "10",
    addressdetails: "0",
  });

  if (bias) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lon));
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DriveEV/1.0 (drieEV.com)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      importance?: number;
    }>;

    const mapped = data.map((item) => ({
      label: shortenNominatimLabel(item.display_name),
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      importance: item.importance ?? 0,
    }));

    if (bias) {
      mapped.sort((a, b) => {
        const distA = haversineKm(bias.lat, bias.lon, a.lat, a.lon);
        const distB = haversineKm(bias.lat, bias.lon, b.lat, b.lon);
        if (Math.abs(distA - distB) > 50) return distA - distB;
        return b.importance - a.importance;
      });
    } else {
      mapped.sort((a, b) => b.importance - a.importance);
    }

    return mapped.map(({ label, lat, lon }) => ({ label, lat, lon }));
  } catch {
    return [];
  }
}

/** Typeahead suggestions — Google Places Autocomplete when configured, else Nominatim. */
export async function geocodeSuggestions(
  query: string,
  bias?: { lat: number; lon: number }
): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return [];

  if (isGoogleGeocodingConfigured()) {
    const google = await googleAutocompleteSuggestions(trimmed, bias);
    if (google.length > 0) {
      return google.map((s) => ({
        label: s.label,
        subtitle: s.subtitle,
        placeId: s.placeId,
      }));
    }
  }

  const fallback = await nominatimSearch(trimmed, bias);
  return fallback.map((r) => ({
    label: r.label,
    lat: r.lat,
    lon: r.lon,
    subtitle: undefined,
  }));
}

export async function resolveGeocodeSuggestion(
  suggestion: GeocodeSuggestion
): Promise<GeocodeResult | null> {
  if (suggestion.lat != null && suggestion.lon != null) {
    return {
      label: suggestion.subtitle
        ? `${suggestion.label}, ${suggestion.subtitle}`
        : suggestion.label,
      lat: suggestion.lat,
      lon: suggestion.lon,
      placeId: suggestion.placeId,
      subtitle: suggestion.subtitle,
    };
  }

  if (suggestion.placeId && isGoogleGeocodingConfigured()) {
    const details = await googlePlaceDetails(suggestion.placeId);
    if (details) {
      return {
        ...details,
        subtitle: suggestion.subtitle,
        label: suggestion.subtitle
          ? `${suggestion.label}, ${suggestion.subtitle}`
          : details.label,
      };
    }
  }

  return null;
}

/** @deprecated Use geocodeSuggestions — kept for compatibility */
export async function geocodePlace(
  query: string,
  bias?: { lat: number; lon: number }
): Promise<GeocodeResult[]> {
  const suggestions = await geocodeSuggestions(query, bias);
  const resolved: GeocodeResult[] = [];

  for (const suggestion of suggestions) {
    const hit = await resolveGeocodeSuggestion(suggestion);
    if (hit) resolved.push(hit);
  }

  return resolved;
}

export async function resolvePlaceId(placeId: string): Promise<GeocodeResult | null> {
  if (!isGoogleGeocodingConfigured()) return null;
  return googlePlaceDetails(placeId);
}
