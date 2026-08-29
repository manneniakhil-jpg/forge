import type { ChargingStation, ChargingSession, VehicleState } from "./types";

export interface ReachabilityCacheData {
  vehicleStates: Record<string, VehicleState & { cachedAt: string }>;
  chargerResults: { stations: ChargingStation[]; center: { lat: number; lon: number }; cachedAt: string } | null;
  sessions: ChargingSession[];
  favorites: string[];
}

const CACHE_KEY = "ev_reachability_cache";

export function createEmptyCache(): ReachabilityCacheData {
  return {
    vehicleStates: {},
    chargerResults: null,
    sessions: [],
    favorites: [],
  };
}

export function loadCache(): ReachabilityCacheData {
  if (typeof window === "undefined") return createEmptyCache();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return createEmptyCache();
    return JSON.parse(raw) as ReachabilityCacheData;
  } catch {
    return createEmptyCache();
  }
}

export function saveCache(data: ReachabilityCacheData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

export function mergeVehicleState(
  cache: ReachabilityCacheData,
  vehicleId: string,
  incoming: VehicleState | null,
  failed: boolean
): VehicleState & { stale: boolean; fromCache: boolean } {
  const cached = cache.vehicleStates[vehicleId];
  if (incoming && !failed) {
    cache.vehicleStates[vehicleId] = { ...incoming, cachedAt: new Date().toISOString() };
    saveCache(cache);
    return { ...incoming, stale: false, fromCache: false };
  }
  if (cached) {
    const { cachedAt: _, ...state } = cached;
    return { ...state, stale: true, fromCache: true };
  }
  return {
    socPct: null,
    rangeKm: null,
    pluggedIn: null,
    chargingStatus: null,
    capturedAt: null,
    fieldAvailability: {
      socPct: false,
      rangeKm: false,
      pluggedIn: false,
      chargingStatus: false,
    },
    stale: true,
    fromCache: false,
  };
}

export function cacheChargerResults(
  cache: ReachabilityCacheData,
  stations: ChargingStation[],
  center: { lat: number; lon: number }
): void {
  cache.chargerResults = { stations, center, cachedAt: new Date().toISOString() };
  saveCache(cache);
}

export function getCachedChargers(cache: ReachabilityCacheData, maxAgeHours = 24): ChargingStation[] | null {
  if (!cache.chargerResults) return null;
  const ageMs = Date.now() - new Date(cache.chargerResults.cachedAt).getTime();
  if (ageMs > maxAgeHours * 3600000) return null;
  return cache.chargerResults.stations;
}
