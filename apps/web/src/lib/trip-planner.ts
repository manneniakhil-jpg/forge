import { v4 as uuidv4 } from "uuid";
import {
  computeUsableRangeKm,
  estimateChargeDurationMin,
  haversineKm,
  type ChargeStop,
  type ConnectorStandard,
  type TripPlan,
} from "@ev/domain";
import {
  findNearestCompatibleStationAsync,
  queryCorridorAsync,
  sampleRoutePoints,
} from "./chargers";
import {
  bestCompatibleConnector,
  pickBestStation,
} from "./trip-station-scoring";
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

function maxComfortLegKm(input: TripInput): number {
  return (
    computeUsableRangeKm(
      80,
      input.reserveSocPct,
      input.batteryKwh,
      input.efficiencyWhKm
    ) * 0.85
  );
}

function socNeededForDistanceKm(input: TripInput, distanceKm: number): number {
  return (
    input.reserveSocPct +
    (distanceKm * input.efficiencyWhKm) / ((input.batteryKwh * 1000) / 100)
  );
}

function targetDepartureSoc(
  arrivalSoc: number,
  remainingDistanceKm: number,
  input: TripInput
): number {
  const maxLegKm = maxComfortLegKm(input);

  if (remainingDistanceKm > maxLegKm) {
    return 80;
  }

  const needed = socNeededForDistanceKm(input, remainingDistanceKm) + 5;
  return Math.min(100, Math.max(arrivalSoc + 10, Math.ceil(needed)));
}

export async function planTrip(
  input: TripInput
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  const chargeStops: ChargeStop[] = [];
  const routeSegments: Array<Array<{ lat: number; lon: number }>> = [];
  const visitedStationIds = new Set<string>();
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
      return buildPlan(
        input,
        chargeStops,
        totalDistanceKm,
        totalDrivingMin,
        Math.max(input.reserveSocPct, destSoc),
        routeSegments
      );
    }

    if (attempt >= maxStops) {
      return {
        error: "NO_VIABLE_ROUTE",
        details: {
          longestLegKm: Math.round(route.distanceKm),
          usableRangeKm: Math.round(usableRange),
          reason: "max_stops_exceeded",
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
    const routeSamples = sampleRoutePoints(route.coordinates, driveBeforeChargeKm + 60);
    const legDist = driveBeforeChargeKm;
    const arrivalSoc = Math.max(
      input.reserveSocPct,
      socAfterDistance(currentSoc, legDist, input.batteryKwh, input.efficiencyWhKm)
    );
    const remainingDistanceKm = Math.max(0, route.distanceKm - driveBeforeChargeKm);

    let nearest: { station: import("@ev/domain").ChargingStation; distanceKm: number } | null =
      null;

    for (const radius of [50, 90, 150]) {
      const maxDetourKm = Math.min(radius, 55);
      const alongRoute = (await queryCorridorAsync(
        routeSamples,
        input.connectorStandards,
        radius,
        needChargeAt
      ))
        .filter((station) => !visitedStationIds.has(station.id))
        .map((station) => ({
          station,
          distanceKm: haversineKm(
            needChargeAt.lat,
            needChargeAt.lon,
            station.latitude,
            station.longitude
          ),
        }))
        .filter((candidate) => candidate.distanceKm <= maxDetourKm);
      if (alongRoute.length > 0) {
        nearest = pickBestStation(
          alongRoute,
          needChargeAt,
          input.connectorStandards,
          arrivalSoc,
          input.reserveSocPct
        );
        break;
      }
      const fallback = await findNearestCompatibleStationAsync(
        needChargeAt,
        input.connectorStandards,
        radius
      );
      if (fallback && !visitedStationIds.has(fallback.station.id)) {
        nearest = pickBestStation(
          [fallback],
          needChargeAt,
          input.connectorStandards,
          arrivalSoc,
          input.reserveSocPct
        );
      }
      if (nearest) break;
    }

    if (!nearest) {
      return {
        error: "NO_VIABLE_ROUTE",
        details: {
          longestLegKm: Math.round(driveBeforeChargeKm),
          usableRangeKm: Math.round(usableRange),
          reason: "no_chargers_on_route",
        },
      };
    }

    const chosenStation = nearest.station;
    visitedStationIds.add(chosenStation.id);
    const departureSoc = targetDepartureSoc(arrivalSoc, remainingDistanceKm, input);
    const connector = bestCompatibleConnector(chosenStation, input.connectorStandards);
    const maxPower = connector?.maxPowerKw ?? Math.max(...chosenStation.connectors.map((c) => c.maxPowerKw));

    chargeStops.push({
      stationId: chosenStation.id,
      stationName: chosenStation.operatorName,
      arrivalSocPct: arrivalSoc,
      departureSocPct: departureSoc,
      chargingDurationMin: estimateChargeDurationMin(
        arrivalSoc,
        departureSoc,
        input.batteryKwh,
        maxPower
      ),
      latitude: chosenStation.latitude,
      longitude: chosenStation.longitude,
      maxPowerKw: connector?.maxPowerKw ?? maxPower,
      connectorStandard: connector?.standard,
      availability: connector?.availability,
      detourKm: Math.round(nearest.distanceKm * 10) / 10,
    });

    currentPos = {
      lat: chosenStation.latitude,
      lon: chosenStation.longitude,
      label: chosenStation.operatorName,
    };
    currentSoc = departureSoc;
  }

  return {
    error: "NO_VIABLE_ROUTE",
    details: { reason: "planning_exhausted" },
  };
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
