import type { ChargingStation, ConnectorStandard } from "@ev/domain";

export type ChargerSortMode = "vehicle" | "fast_charge" | "distance";

export function stationMaxPowerKw(station: ChargingStation): number {
  if (station.connectors.length === 0) return 0;
  return Math.max(...station.connectors.map((c) => c.maxPowerKw));
}

export function stationMaxCompatiblePowerKw(
  station: ChargingStation,
  vehicleStandards: ConnectorStandard[]
): number {
  if (vehicleStandards.length === 0) return stationMaxPowerKw(station);
  const matching = station.connectors.filter((c) => vehicleStandards.includes(c.standard));
  if (matching.length === 0) return 0;
  return Math.max(...matching.map((c) => c.maxPowerKw));
}

export function isStationCompatible(
  station: ChargingStation,
  vehicleStandards: ConnectorStandard[]
): boolean {
  if (vehicleStandards.length === 0) return true;
  return station.connectors.some((c) => vehicleStandards.includes(c.standard));
}

export function sortChargerStations<T extends ChargingStation & { distanceKm: number }>(
  stations: T[],
  options: {
    sortBy: ChargerSortMode;
    vehicleConnectors: ConnectorStandard[];
    favoriteIds?: string[];
  }
): T[] {
  const favSet = new Set(options.favoriteIds ?? []);
  const { sortBy, vehicleConnectors } = options;

  return [...stations].sort((a, b) => {
    const aFav = favSet.has(a.id) ? 0 : 1;
    const bFav = favSet.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;

    if (sortBy === "fast_charge") {
      const powerDiff = stationMaxPowerKw(b) - stationMaxPowerKw(a);
      if (powerDiff !== 0) return powerDiff;
    } else if (sortBy === "vehicle" && vehicleConnectors.length > 0) {
      const aCompat = isStationCompatible(a, vehicleConnectors) ? 0 : 1;
      const bCompat = isStationCompatible(b, vehicleConnectors) ? 0 : 1;
      if (aCompat !== bCompat) return aCompat - bCompat;
      const powerDiff =
        stationMaxCompatiblePowerKw(b, vehicleConnectors) -
        stationMaxCompatiblePowerKw(a, vehicleConnectors);
      if (powerDiff !== 0) return powerDiff;
    }

    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.operatorName.localeCompare(b.operatorName);
  });
}
