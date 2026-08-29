import {
  haversineKm,
  estimateChargeDurationMin,
  type ChargeStop,
  type ChargingStation,
  type ConnectorStandard,
} from "@ev/domain";
import {
  bestCompatibleConnector,
  scoreChargingStation,
} from "./trip-station-scoring";

export type StationCandidate = {
  station: ChargingStation;
  distanceKm: number;
  score: number;
};

export interface NearbySearchContext {
  lat: number;
  lon: number;
  radiusKm: number;
  connectorStandards?: ConnectorStandard[];
  connectorStandard?: ConnectorStandard;
  minPowerKw?: number;
  networkId?: string;
  priceCeiling?: number;
  excludeIds?: Set<string>;
}

export interface TripStopContext {
  needChargeAt: { lat: number; lon: number };
  connectorStandards: ConnectorStandard[];
  arrivalSocPct: number;
  reserveSocPct: number;
  maxDetourKm: number;
  excludeIds?: Set<string>;
}

function stationMatchesFilters(
  station: ChargingStation,
  ctx: NearbySearchContext
): boolean {
  if (ctx.networkId && station.networkId !== ctx.networkId) return false;
  if (ctx.excludeIds?.has(station.id)) return false;

  const standards = ctx.connectorStandard
    ? [ctx.connectorStandard]
    : ctx.connectorStandards ?? [];

  const matchingConnectors = station.connectors.filter((c) => {
    if (standards.length > 0 && !standards.includes(c.standard)) return false;
    if (ctx.minPowerKw && c.maxPowerKw < ctx.minPowerKw) return false;
    if (ctx.priceCeiling !== undefined) {
      if (c.pricePerKwh === "Unknown") return false;
      if (c.pricePerKwh > ctx.priceCeiling) return false;
    }
    return true;
  });

  return matchingConnectors.length > 0;
}

function stationUsableForTrip(
  station: ChargingStation,
  connectorStandards: ConnectorStandard[]
): boolean {
  return station.connectors.some(
    (c) =>
      connectorStandards.includes(c.standard) &&
      (c.availability === "Available" || c.availability === "Unknown")
  );
}

/** Rank stations for browse/search — pure distance after hard filters. */
export function rankNearbyStations(
  stations: Array<ChargingStation & { distanceKm: number }>,
  ctx: NearbySearchContext
): Array<ChargingStation & { distanceKm: number }> {
  return stations
    .filter((s) => s.distanceKm <= ctx.radiusKm + 0.01 && stationMatchesFilters(s, ctx))
    .sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.operatorName.localeCompare(b.operatorName);
    });
}

/** Rank corridor candidates for trip planning — power, availability, detour score. */
export function rankTripStopCandidates(
  stations: ChargingStation[],
  ctx: TripStopContext
): StationCandidate[] {
  const candidates: StationCandidate[] = [];

  for (const station of stations) {
    if (ctx.excludeIds?.has(station.id)) continue;
    if (!stationUsableForTrip(station, ctx.connectorStandards)) continue;

    const distanceKm = haversineKm(
      ctx.needChargeAt.lat,
      ctx.needChargeAt.lon,
      station.latitude,
      station.longitude
    );
    if (distanceKm > ctx.maxDetourKm) continue;

    const score = scoreChargingStation(
      station,
      ctx.needChargeAt,
      ctx.connectorStandards,
      ctx.arrivalSocPct,
      ctx.reserveSocPct
    );
    if (score === -Infinity) continue;

    candidates.push({ station, distanceKm, score });
  }

  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.station.operatorName.localeCompare(b.station.operatorName);
  });
}

export function pickBestTripStop(
  stations: ChargingStation[],
  ctx: TripStopContext
): StationCandidate | null {
  return rankTripStopCandidates(stations, ctx)[0] ?? null;
}

export function buildChargeStop(
  station: ChargingStation,
  arrivalSocPct: number,
  departureSocPct: number,
  detourKm: number,
  connectorStandards: ConnectorStandard[],
  batteryKwh: number
): ChargeStop {
  const connector = bestCompatibleConnector(station, connectorStandards);
  const maxPower =
    connector?.maxPowerKw ?? Math.max(...station.connectors.map((c) => c.maxPowerKw), 50);

  return {
    stationId: station.id,
    stationName: station.operatorName,
    arrivalSocPct,
    departureSocPct,
    chargingDurationMin: estimateChargeDurationMin(
      arrivalSocPct,
      departureSocPct,
      batteryKwh,
      maxPower
    ),
    latitude: station.latitude,
    longitude: station.longitude,
    maxPowerKw: connector?.maxPowerKw ?? maxPower,
    connectorStandard: connector?.standard,
    availability: connector?.availability,
    detourKm: Math.round(detourKm * 10) / 10,
  };
}

/** Stations within corridorKm of any polyline sample point (exact haversine refine). */
export function filterStationsAlongCorridor(
  stations: ChargingStation[],
  points: Array<{ lat: number; lon: number }>,
  corridorKm: number,
  connectorStandards: ConnectorStandard[]
): ChargingStation[] {
  const results: ChargingStation[] = [];
  const seen = new Set<string>();

  for (const station of stations) {
    if (seen.has(station.id)) continue;
    if (!stationUsableForTrip(station, connectorStandards)) continue;

    let minDist = Infinity;
    for (const pt of points) {
      const d = haversineKm(pt.lat, pt.lon, station.latitude, station.longitude);
      if (d < minDist) minDist = d;
    }
    if (minDist > corridorKm) continue;

    seen.add(station.id);
    results.push(station);
  }

  return results;
}
