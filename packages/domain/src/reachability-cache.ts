import type { ChargingStation, ChargingSession, VehicleState } from "./types";

export type CachedActiveSession = {
  id: string;
  energyKwh: number;
  instantaneousPowerKw: number;
  elapsedSeconds: number;
  cost: number | null;
  currency: string;
  lastRefreshAt: string | null;
};

export type CachedHistorySnapshot = {
  sessions: Array<{
    id: string;
    stationId: string;
    startTs: string;
    endTs: string;
    energyKwh: number;
    cost: number | null;
    currency: string;
  }>;
  summary: {
    totalEnergyKwh: number;
    totalCost: number;
    sessionCount: number;
    avgCostPerKwh: number | null;
  };
};

export interface ReachabilityCacheData {
  vehicleStates: Record<string, VehicleState & { cachedAt: string }>;
  chargerResults: {
    stations: ChargingStation[];
    center: { lat: number; lon: number };
    cachedAt: string;
  } | null;
  activeSession: (CachedActiveSession & { cachedAt: string }) | null;
  historySnapshot: (CachedHistorySnapshot & { cachedAt: string }) | null;
  sessions: ChargingSession[];
  favorites: string[];
}

const CACHE_KEY = "ev_reachability_cache";

export function createEmptyCache(): ReachabilityCacheData {
  return {
    vehicleStates: {},
    chargerResults: null,
    activeSession: null,
    historySnapshot: null,
    sessions: [],
    favorites: [],
  };
}

function normalizeCache(raw: ReachabilityCacheData): ReachabilityCacheData {
  return {
    vehicleStates: raw.vehicleStates ?? {},
    chargerResults: raw.chargerResults ?? null,
    activeSession: raw.activeSession ?? null,
    historySnapshot: raw.historySnapshot ?? null,
    sessions: raw.sessions ?? [],
    favorites: raw.favorites ?? [],
  };
}

export function loadCache(): ReachabilityCacheData {
  if (typeof window === "undefined") return createEmptyCache();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return createEmptyCache();
    return normalizeCache(JSON.parse(raw) as ReachabilityCacheData);
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
  const entry = getCachedChargerResults(cache, maxAgeHours);
  return entry?.stations ?? null;
}

export function getCachedChargerResults(
  cache: ReachabilityCacheData,
  maxAgeHours = 24
): { stations: ChargingStation[]; center: { lat: number; lon: number }; cachedAt: string } | null {
  if (!cache.chargerResults) return null;
  const ageMs = Date.now() - new Date(cache.chargerResults.cachedAt).getTime();
  if (ageMs > maxAgeHours * 3600000) return null;
  return cache.chargerResults;
}

export function cacheFavorites(cache: ReachabilityCacheData, favorites: string[]): void {
  cache.favorites = favorites;
  saveCache(cache);
}

export function mergeActiveSession(
  cache: ReachabilityCacheData,
  incoming: CachedActiveSession | null,
  failed: boolean
): (CachedActiveSession & { stale: boolean; fromCache: boolean }) | null {
  if (!failed) {
    if (incoming) {
      cache.activeSession = { ...incoming, cachedAt: new Date().toISOString() };
    } else {
      cache.activeSession = null;
    }
    saveCache(cache);
    return incoming ? { ...incoming, stale: false, fromCache: false } : null;
  }
  if (cache.activeSession) {
    const { cachedAt: _, ...session } = cache.activeSession;
    return { ...session, stale: true, fromCache: true };
  }
  return null;
}

export function mergeHistorySnapshot(
  cache: ReachabilityCacheData,
  incoming: CachedHistorySnapshot | null,
  failed: boolean
): (CachedHistorySnapshot & { stale: boolean; fromCache: boolean; cachedAt: string }) | null {
  if (!failed && incoming) {
    const cachedAt = new Date().toISOString();
    cache.historySnapshot = { ...incoming, cachedAt };
    saveCache(cache);
    return { ...incoming, cachedAt, stale: false, fromCache: false };
  }
  if (failed && cache.historySnapshot) {
    const { cachedAt, ...data } = cache.historySnapshot;
    return { ...data, cachedAt, stale: true, fromCache: true };
  }
  return null;
}
