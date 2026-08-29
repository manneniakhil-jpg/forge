import { v4 as uuidv4 } from "uuid";
import {
  computeUsableRangeKm,
  estimateChargeDurationMin,
  haversineKm,
  type ChargeStop,
  type ConnectorStandard,
  type TripPlan,
} from "@ev/domain";
import { queryCorridor } from "./chargers";

interface TripInput {
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
  departureSocPct: number;
  reserveSocPct: number;
  batteryKwh: number;
  efficiencyWhKm: number;
  connectorStandards: ConnectorStandard[];
}

function interpolatePoint(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  fraction: number
) {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: a.lon + (b.lon - a.lon) * fraction,
  };
}

export function planTrip(input: TripInput): TripPlan | { error: string; details?: Record<string, unknown> } {
  const totalDistanceKm = haversineKm(
    input.origin.lat,
    input.origin.lon,
    input.destination.lat,
    input.destination.lon
  );

  if (totalDistanceKm > 2000) {
    return { error: "INVALID_TRIP_INPUT", details: { field: "distance" } };
  }

  const usableRange = computeUsableRangeKm(
    input.departureSocPct,
    input.reserveSocPct,
    input.batteryKwh,
    input.efficiencyWhKm
  );

  const corridorPoints = [
    input.origin,
    interpolatePoint(input.origin, input.destination, 0.25),
    interpolatePoint(input.origin, input.destination, 0.5),
    interpolatePoint(input.origin, input.destination, 0.75),
    input.destination,
  ];

  const candidates = queryCorridor(corridorPoints, input.connectorStandards);

  if (totalDistanceKm <= usableRange && input.departureSocPct >= input.reserveSocPct) {
    const destSoc = Math.round(
      input.departureSocPct -
        (totalDistanceKm * input.efficiencyWhKm) / ((input.batteryKwh * 1000) / 100)
    );
    return buildPlan(input, [], totalDistanceKm, destSoc);
  }

  let currentSoc = input.departureSocPct;
  let distanceTraveled = 0;
  const chargeStops: ChargeStop[] = [];
  let currentPos = input.origin;
  const maxStops = 10;

  while (distanceTraveled < totalDistanceKm && chargeStops.length < maxStops) {
    const remainingDist = totalDistanceKm - distanceTraveled;
    const rangeAtCurrent = computeUsableRangeKm(
      currentSoc,
      input.reserveSocPct,
      input.batteryKwh,
      input.efficiencyWhKm
    );

    if (remainingDist <= rangeAtCurrent) break;

    const legDist = Math.min(remainingDist * 0.7, rangeAtCurrent * 0.85);
    const nextPos = interpolatePoint(
      currentPos,
      input.destination,
      (distanceTraveled + legDist) / totalDistanceKm
    );

    const nearby = candidates
      .map((s) => ({
        station: s,
        dist: haversineKm(nextPos.lat, nextPos.lon, s.latitude, s.longitude),
      }))
      .filter((s) => s.dist < 50)
      .sort((a, b) => a.dist - b.dist);

    if (nearby.length === 0) {
      return {
        error: "NO_VIABLE_ROUTE",
        details: {
          longestLegKm: Math.round(remainingDist),
          usableRangeKm: Math.round(usableRange),
        },
      };
    }

    const chosen = nearby[0].station;
    const arrivalSoc = Math.max(
      input.reserveSocPct,
      Math.round(currentSoc - (legDist * input.efficiencyWhKm) / ((input.batteryKwh * 1000) / 100))
    );
    const isFinal = chargeStops.length === maxStops - 1 || remainingDist - legDist <= rangeAtCurrent;
    const departureSoc = isFinal
      ? Math.min(100, Math.max(arrivalSoc + 20, 80))
      : Math.min(80, Math.max(arrivalSoc + 30, input.reserveSocPct + 20));

    const maxPower = Math.max(...chosen.connectors.map((c) => c.maxPowerKw));
    const chargingMin = estimateChargeDurationMin(
      arrivalSoc,
      departureSoc,
      input.batteryKwh,
      maxPower
    );

    chargeStops.push({
      stationId: chosen.id,
      stationName: chosen.operatorName,
      arrivalSocPct: arrivalSoc,
      departureSocPct: departureSoc,
      chargingDurationMin: chargingMin,
      latitude: chosen.latitude,
      longitude: chosen.longitude,
    });

    currentSoc = departureSoc;
    distanceTraveled += legDist;
    currentPos = { lat: chosen.latitude, lon: chosen.longitude, label: chosen.operatorName };
  }

  const finalLegDist = totalDistanceKm - distanceTraveled;
  const destSoc = Math.round(
    currentSoc - (finalLegDist * input.efficiencyWhKm) / ((input.batteryKwh * 1000) / 100)
  );

  if (destSoc < input.reserveSocPct) {
    return {
      error: "NO_VIABLE_ROUTE",
      details: {
        longestLegKm: Math.round(finalLegDist),
        usableRangeKm: Math.round(usableRange),
      },
    };
  }

  return buildPlan(input, chargeStops, totalDistanceKm, destSoc);
}

function buildPlan(
  input: TripInput,
  chargeStops: ChargeStop[],
  totalDistanceKm: number,
  destSoc: number
): TripPlan {
  const avgSpeedKmh = 80;
  const drivingMin = Math.round((totalDistanceKm / avgSpeedKmh) * 60);
  const chargingMin = chargeStops.reduce((sum, s) => sum + s.chargingDurationMin, 0);

  return {
    id: uuidv4(),
    origin: input.origin,
    destination: input.destination,
    chargeStops,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDrivingMin: drivingMin,
    totalChargingMin: chargingMin,
    destinationSocPct: Math.max(input.reserveSocPct, destSoc),
    reserveSocPct: input.reserveSocPct,
  };
}
