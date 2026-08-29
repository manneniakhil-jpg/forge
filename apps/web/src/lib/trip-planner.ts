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
import {
  fetchRoadRoute,
  mergeRouteSegments,
  pointAtDistance,
  socAfterDistance,
} from "./routing";

function findSliceEnd(
  coordinates: Array<{ lat: number; lon: number }>,
  targetKm: number
): number {
  let accumulated = 0;
  for (let i = 1; i < coordinates.length; i++) {
    accumulated += haversineKm(
      coordinates[i - 1].lat,
      coordinates[i - 1].lon,
      coordinates[i].lat,
      coordinates[i].lon
    );
    if (accumulated >= targetKm) return i;
  }
  return coordinates.length - 1;
}

interface TripInput {
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
  departureSocPct: number;
  reserveSocPct: number;
  batteryKwh: number;
  efficiencyWhKm: number;
  connectorStandards: ConnectorStandard[];
}

export async function planTrip(
  input: TripInput
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  const chargeStops: ChargeStop[] = [];
  const routeSegments: Array<Array<{ lat: number; lon: number }>> = [];
  let currentPos = input.origin;
  let currentSoc = input.departureSocPct;
  let totalDistanceKm = 0;
  let totalDrivingMin = 0;
  const maxStops = 10;

  for (let attempt = 0; attempt <= maxStops; attempt++) {
    const route = await fetchRoadRoute(currentPos, input.destination);
    if ("error" in route) {
      if (attempt === 0) return { error: route.error };
      return {
        error: "NO_VIABLE_ROUTE",
        details: { reason: "Routing failed after charge stop" },
      };
    }

    const usableRange = computeUsableRangeKm(
      currentSoc,
      input.reserveSocPct,
      input.batteryKwh,
      input.efficiencyWhKm
    );

    if (route.distanceKm <= usableRange) {
      routeSegments.push(route.coordinates);
      totalDistanceKm += route.distanceKm;
      totalDrivingMin += route.durationMin;
      const destSoc = socAfterDistance(
        currentSoc,
        route.distanceKm,
        input.batteryKwh,
        input.efficiencyWhKm
      );
      if (destSoc < input.reserveSocPct) {
        return {
          error: "NO_VIABLE_ROUTE",
          details: {
            longestLegKm: Math.round(route.distanceKm),
            usableRangeKm: Math.round(usableRange),
          },
        };
      }
      return buildPlan(input, chargeStops, totalDistanceKm, totalDrivingMin, destSoc, routeSegments);
    }

    if (attempt >= maxStops) {
      return {
        error: "NO_VIABLE_ROUTE",
        details: {
          longestLegKm: Math.round(route.distanceKm),
          usableRangeKm: Math.round(usableRange),
        },
      };
    }

    const driveBeforeChargeKm = Math.min(usableRange * 0.85, route.distanceKm * 0.9);
    routeSegments.push(
      route.coordinates.slice(0, findSliceEnd(route.coordinates, driveBeforeChargeKm) + 1)
    );
    totalDistanceKm += driveBeforeChargeKm;
    totalDrivingMin += Math.round((driveBeforeChargeKm / route.distanceKm) * route.durationMin);

    const needChargeAt = pointAtDistance(route.coordinates, driveBeforeChargeKm);

    const candidates = queryCorridor([needChargeAt], input.connectorStandards, 40)
      .map((station) => ({
        station,
        dist: haversineKm(
          needChargeAt.lat,
          needChargeAt.lon,
          station.latitude,
          station.longitude
        ),
      }))
      .sort((a, b) => a.dist - b.dist);

    if (candidates.length === 0 || candidates[0].dist > 40) {
      return {
        error: "NO_VIABLE_ROUTE",
        details: {
          longestLegKm: Math.round(route.distanceKm),
          usableRangeKm: Math.round(usableRange),
        },
      };
    }

    const chosen = candidates[0].station;
    const legDist = driveBeforeChargeKm;
    const arrivalSoc = Math.max(
      input.reserveSocPct,
      socAfterDistance(currentSoc, legDist, input.batteryKwh, input.efficiencyWhKm)
    );
    const departureSoc = Math.min(80, Math.max(arrivalSoc + 25, input.reserveSocPct + 15));
    const maxPower = Math.max(...chosen.connectors.map((c) => c.maxPowerKw));

    chargeStops.push({
      stationId: chosen.id,
      stationName: chosen.operatorName,
      arrivalSocPct: arrivalSoc,
      departureSocPct: departureSoc,
      chargingDurationMin: estimateChargeDurationMin(
        arrivalSoc,
        departureSoc,
        input.batteryKwh,
        maxPower
      ),
      latitude: chosen.latitude,
      longitude: chosen.longitude,
    });

    currentPos = {
      lat: chosen.latitude,
      lon: chosen.longitude,
      label: chosen.operatorName,
    };
    currentSoc = departureSoc;
  }

  return { error: "NO_VIABLE_ROUTE" };
}

function buildPlan(
  input: TripInput,
  chargeStops: ChargeStop[],
  totalDistanceKm: number,
  totalDrivingMin: number,
  destSoc: number,
  routeSegments: Array<Array<{ lat: number; lon: number }>>
): TripPlan {
  const chargingMin = chargeStops.reduce((sum, s) => sum + s.chargingDurationMin, 0);
  const merged = mergeRouteSegments(routeSegments);

  return {
    id: uuidv4(),
    origin: input.origin,
    destination: input.destination,
    chargeStops,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDrivingMin,
    totalChargingMin: chargingMin,
    destinationSocPct: Math.max(input.reserveSocPct, destSoc),
    reserveSocPct: input.reserveSocPct,
    routeCoordinates: merged.map((p) => [p.lat, p.lon] as [number, number]),
    routingSource: "osrm",
  };
}
