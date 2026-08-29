import type { ChargingStation } from "@ev/domain";
import { haversineKm, loadCache } from "@ev/domain";

export function getReachabilityCache() {
  return loadCache();
}

export function stationsWithDistance(
  stations: ChargingStation[],
  center: { lat: number; lon: number }
): Array<ChargingStation & { distanceKm: number }> {
  return stations.map((station) => ({
    ...station,
    distanceKm: haversineKm(center.lat, center.lon, station.latitude, station.longitude),
  }));
}

export function isAuthError(error: unknown): boolean {
  const err = error as { code?: string };
  return err.code === "SESSION_EXPIRED" || err.code === "INVALID_CREDENTIALS";
}
