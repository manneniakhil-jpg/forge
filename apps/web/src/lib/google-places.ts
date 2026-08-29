import type { ConnectorStandard, ChargingStation } from "@ev/domain";
import { mapGooglePlaceToStation } from "./places-mapper";

const PLACES_BASE = "https://places.googleapis.com/v1/places:searchNearby";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_GOOGLE_RADIUS_KM = 50;

type CacheEntry = {
  expiresAt: number;
  stations: Array<ChargingStation & { distanceKm: number }>;
};

const searchCache = new Map<string, CacheEntry>();
const stationRegistry = new Map<string, ChargingStation & { distanceKm: number }>();

export function getCachedGoogleStation(stationId: string): ChargingStation | null {
  return stationRegistry.get(stationId) ?? null;
}

function cacheKey(lat: number, lon: number, radiusKm: number): string {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}_${radiusKm}`;
}

function googleConnectorFilter(standard?: ConnectorStandard): string | undefined {
  if (!standard) return undefined;
  switch (standard) {
    case "CCS":
      return "EV_CONNECTOR_TYPE_CCS_COMBO_1";
    case "NACS":
      return "EV_CONNECTOR_TYPE_NACS";
    case "CHAdeMO":
      return "EV_CONNECTOR_TYPE_CHADEMO";
    case "Type2":
      return "EV_CONNECTOR_TYPE_J1772";
    default:
      return undefined;
  }
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export async function fetchNearbyEvStations(params: {
  lat: number;
  lon: number;
  radiusKm: number;
  connectorStandard?: ConnectorStandard;
  minPowerKw?: number;
}): Promise<Array<ChargingStation & { distanceKm: number }>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  const radiusKm = Math.min(params.radiusKm, MAX_GOOGLE_RADIUS_KM);
  const key = cacheKey(params.lat, params.lon, radiusKm);
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    for (const station of cached.stations) {
      stationRegistry.set(station.id, station);
    }
    return applyClientFilters(cached.stations, params);
  }

  const radiusM = Math.max(500, Math.round(radiusKm * 1000));
  const body: Record<string, unknown> = {
    includedTypes: ["electric_vehicle_charging_station"],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: params.lat, longitude: params.lon },
        radius: radiusM,
      },
    },
  };

  const connectorType = googleConnectorFilter(params.connectorStandard);
  if (connectorType || params.minPowerKw) {
    body.evOptions = {
      ...(connectorType ? { connectorTypes: [connectorType] } : {}),
      ...(params.minPowerKw ? { minimumChargingRateKw: params.minPowerKw } : {}),
    };
  }

  const res = await fetch(PLACES_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.evChargeOptions",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google Places error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { places?: unknown[] };
  const origin = { lat: params.lat, lon: params.lon };

  const stations = (data.places ?? [])
    .map((place) => mapGooglePlaceToStation(place as Parameters<typeof mapGooglePlaceToStation>[0], origin))
    .filter((s): s is ChargingStation & { distanceKm: number } => s !== null)
    .sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.operatorName.localeCompare(b.operatorName);
    });

  searchCache.set(key, { stations, expiresAt: Date.now() + CACHE_TTL_MS });
  for (const station of stations) {
    stationRegistry.set(station.id, station);
  }
  return applyClientFilters(stations, params);
}

function applyClientFilters(
  stations: Array<ChargingStation & { distanceKm: number }>,
  params: { connectorStandard?: ConnectorStandard; minPowerKw?: number; radiusKm: number }
): Array<ChargingStation & { distanceKm: number }> {
  return stations.filter((station) => {
    if (station.distanceKm > params.radiusKm) return false;
    const connectors = station.connectors.filter((c) => {
      if (params.connectorStandard && c.standard !== params.connectorStandard) return false;
      if (params.minPowerKw && c.maxPowerKw < params.minPowerKw) return false;
      return true;
    });
    return connectors.length > 0;
  });
}
