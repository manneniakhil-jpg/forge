import { v4 as uuidv4 } from "uuid";
import {
  computeUsableRangeKm,
  haversineKm,
  type ChargeStop,
  type ConnectorStandard,
  type TripPlan,
} from "@ev/domain";
import {
  getStationById,
  listCorridorAlternatives,
  queryCorridorAsync,
  sampleRoutePoints,
} from "./chargers";
import { buildChargeStop, pickBestTripStop } from "./station-selector";
import {
  fetchRoadRoute,
  mergeRouteSegments,
  pointAtDistance,
  preferredRoutingSource,
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

export interface TripInput {
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
  departureSocPct: number;
  reserveSocPct: number;
  batteryKwh: number;
  efficiencyWhKm: number;
  connectorStandards: ConnectorStandard[];
}

interface PlannerState {
  chargeStops: ChargeStop[];
  routeSegments: Array<Array<{ lat: number; lon: number }>>;
  visitedStationIds: Set<string>;
  currentPos: { lat: number; lon: number; label: string };
  currentSoc: number;
  totalDistanceKm: number;
  totalDrivingMin: number;
}

interface PlannerOptions {
  skipGoogleCorridor?: boolean;
}

function maxComfortLegKm(input: TripInput): number {
  return (
    computeUsableRangeKm(80, input.reserveSocPct, input.batteryKwh, input.efficiencyWhKm) * 0.85
  );
}

function socNeededForDistanceKm(input: TripInput, distanceKm: number): number {
  return (
    input.reserveSocPct +
    (distanceKm * input.efficiencyWhKm) / ((input.batteryKwh * 1000) / 100)
  );
}

export function targetDepartureSoc(
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

function buildPlan(
  input: TripInput,
  state: PlannerState,
  destSoc: number,
  planId?: string
): TripPlan {
  const chargingMin = state.chargeStops.reduce((sum, s) => sum + s.chargingDurationMin, 0);
  const merged = mergeRouteSegments(state.routeSegments);

  return {
    id: planId ?? uuidv4(),
    origin: input.origin,
    destination: input.destination,
    chargeStops: state.chargeStops,
    totalDistanceKm: Math.round(state.totalDistanceKm * 10) / 10,
    totalDrivingMin: state.totalDrivingMin,
    totalChargingMin: chargingMin,
    destinationSocPct: Math.max(input.reserveSocPct, destSoc),
    reserveSocPct: input.reserveSocPct,
    routeCoordinates: merged.map((p) => [p.lat, p.lon] as [number, number]),
    routingSource: preferredRoutingSource(),
  };
}

async function continuePlanning(
  input: TripInput,
  state: PlannerState,
  maxStops: number,
  options: PlannerOptions = {}
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  for (let attempt = state.chargeStops.length; attempt <= maxStops; attempt++) {
    const route = await fetchRoadRoute(state.currentPos, input.destination);
    if ("error" in route) {
      if (state.chargeStops.length === 0) return { error: route.error };
      return {
        error: "NO_VIABLE_ROUTE",
        details: { reason: "Routing failed after charge stop" },
      };
    }

    const usableRange = computeUsableRangeKm(
      state.currentSoc,
      input.reserveSocPct,
      input.batteryKwh,
      input.efficiencyWhKm
    );

    if (route.distanceKm <= usableRange) {
      state.routeSegments.push(route.coordinates);
      state.totalDistanceKm += route.distanceKm;
      state.totalDrivingMin += route.durationMin;
      const destSoc = socAfterDistance(
        state.currentSoc,
        route.distanceKm,
        input.batteryKwh,
        input.efficiencyWhKm
      );
      return buildPlan(input, state, Math.max(input.reserveSocPct, destSoc));
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
    state.routeSegments.push(
      route.coordinates.slice(0, findSliceEnd(route.coordinates, driveBeforeChargeKm) + 1)
    );
    state.totalDistanceKm += driveBeforeChargeKm;
    state.totalDrivingMin += Math.round(
      (driveBeforeChargeKm / route.distanceKm) * route.durationMin
    );

    const needChargeAt = pointAtDistance(route.coordinates, driveBeforeChargeKm);
    const routeSamples = sampleRoutePoints(route.coordinates, driveBeforeChargeKm + 60);
    const arrivalSoc = Math.max(
      input.reserveSocPct,
      socAfterDistance(
        state.currentSoc,
        driveBeforeChargeKm,
        input.batteryKwh,
        input.efficiencyWhKm
      )
    );
    const remainingDistanceKm = Math.max(0, route.distanceKm - driveBeforeChargeKm);

    let picked: { station: import("@ev/domain").ChargingStation; distanceKm: number } | null =
      null;

    const searchPasses = options.skipGoogleCorridor
      ? [
          { radius: 55, skipGoogle: true },
          { radius: 150, skipGoogle: true },
        ]
      : [
          { radius: 55, skipGoogle: true },
          { radius: 150, skipGoogle: true },
          { radius: 150, skipGoogle: false },
        ];

    for (const { radius, skipGoogle } of searchPasses) {
      const maxDetourKm = Math.min(radius, 55);
      const alongRoute = await queryCorridorAsync(
        routeSamples,
        input.connectorStandards,
        radius,
        needChargeAt,
        { skipGoogle }
      );

      const best = pickBestTripStop(alongRoute, {
        needChargeAt,
        connectorStandards: input.connectorStandards,
        arrivalSocPct: arrivalSoc,
        reserveSocPct: input.reserveSocPct,
        maxDetourKm,
        excludeIds: state.visitedStationIds,
      });

      if (best) {
        picked = { station: best.station, distanceKm: best.distanceKm };
        break;
      }
    }

    if (!picked) {
      return {
        error: "NO_VIABLE_ROUTE",
        details: {
          longestLegKm: Math.round(driveBeforeChargeKm),
          usableRangeKm: Math.round(usableRange),
          reason: "no_chargers_on_route",
        },
      };
    }

    const departureSoc = targetDepartureSoc(arrivalSoc, remainingDistanceKm, input);
    state.visitedStationIds.add(picked.station.id);
    state.chargeStops.push(
      buildChargeStop(
        picked.station,
        arrivalSoc,
        departureSoc,
        picked.distanceKm,
        input.connectorStandards,
        input.batteryKwh
      )
    );

    state.currentPos = {
      lat: picked.station.latitude,
      lon: picked.station.longitude,
      label: picked.station.operatorName,
    };
    state.currentSoc = departureSoc;
  }

  return { error: "NO_VIABLE_ROUTE", details: { reason: "planning_exhausted" } };
}

async function replanWithPrefixStops(
  input: TripInput,
  prefixStops: ChargeStop[],
  planId?: string
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  const state: PlannerState = {
    chargeStops: [],
    routeSegments: [],
    visitedStationIds: new Set<string>(),
    currentPos: input.origin,
    currentSoc: input.departureSocPct,
    totalDistanceKm: 0,
    totalDrivingMin: 0,
  };

  for (const stop of prefixStops) {
    const station = getStationById(stop.stationId);
    if (!station) {
      return { error: "STATION_NOT_FOUND", details: { stationId: stop.stationId } };
    }

    const leg = await fetchRoadRoute(state.currentPos, {
      lat: station.latitude,
      lon: station.longitude,
    });
    if ("error" in leg) {
      return { error: leg.error };
    }

    state.routeSegments.push(leg.coordinates);
    state.totalDistanceKm += leg.distanceKm;
    state.totalDrivingMin += leg.durationMin;

    const arrivalSoc = Math.max(
      input.reserveSocPct,
      socAfterDistance(
        state.currentSoc,
        leg.distanceKm,
        input.batteryKwh,
        input.efficiencyWhKm
      )
    );

    state.chargeStops.push(
      buildChargeStop(
        station,
        arrivalSoc,
        stop.departureSocPct,
        haversineKm(
          state.currentPos.lat,
          state.currentPos.lon,
          station.latitude,
          station.longitude
        ),
        input.connectorStandards,
        input.batteryKwh
      )
    );

    state.visitedStationIds.add(station.id);
    state.currentPos = {
      lat: station.latitude,
      lon: station.longitude,
      label: station.operatorName,
    };
    state.currentSoc = stop.departureSocPct;
  }

  const result = await continuePlanning(input, state, prefixStops.length + 10);
  if ("error" in result) return result;
  return { ...result, id: planId ?? result.id };
}

export async function planTrip(
  input: TripInput
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  return planTripExcluding(input, []);
}

export async function planTripExcluding(
  input: TripInput,
  excludeStationIds: Iterable<string>,
  options: PlannerOptions = {}
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  const state: PlannerState = {
    chargeStops: [],
    routeSegments: [],
    visitedStationIds: new Set(excludeStationIds),
    currentPos: input.origin,
    currentSoc: input.departureSocPct,
    totalDistanceKm: 0,
    totalDrivingMin: 0,
  };
  return continuePlanning(input, state, 10, options);
}

function planStopSignature(plan: TripPlan): string {
  return plan.chargeStops.map((s) => s.stationId).join("|") || "direct";
}

export async function planTripAlternatives(
  input: TripInput,
  maxAlternatives = 3
): Promise<TripPlan[]> {
  const cap = Math.min(3, Math.max(1, maxAlternatives));
  const plans: TripPlan[] = [];
  const seen = new Set<string>();
  const excludeAll = new Set<string>();

  for (let i = 0; i < cap; i++) {
    const result = await planTripExcluding(input, excludeAll, {
      skipGoogleCorridor: i > 0,
    });
    if ("error" in result) break;

    const signature = planStopSignature(result);
    if (seen.has(signature)) break;
    seen.add(signature);
    plans.push(result);

    for (const stop of result.chargeStops) {
      excludeAll.add(stop.stationId);
    }

    if (result.chargeStops.length === 0) break;
  }

  return plans.sort((a, b) => {
    const durationA = a.totalDrivingMin + a.totalChargingMin;
    const durationB = b.totalDrivingMin + b.totalChargingMin;
    if (durationA !== durationB) return durationA - durationB;
    if (a.chargeStops.length !== b.chargeStops.length) {
      return a.chargeStops.length - b.chargeStops.length;
    }
    return a.totalDistanceKm - b.totalDistanceKm;
  });
}

function positionBeforeStop(
  input: TripInput,
  plan: TripPlan,
  stopIndex: number
): { pos: { lat: number; lon: number; label: string }; soc: number } {
  if (stopIndex === 0) {
    return { pos: input.origin, soc: input.departureSocPct };
  }
  const prev = plan.chargeStops[stopIndex - 1];
  return {
    pos: { lat: prev.latitude, lon: prev.longitude, label: prev.stationName },
    soc: prev.departureSocPct,
  };
}

export async function getStopAlternatives(
  input: TripInput,
  plan: TripPlan,
  stopIndex: number
) {
  if (stopIndex < 0 || stopIndex >= plan.chargeStops.length) {
    return { error: "INVALID_STOP_INDEX" as const };
  }

  const { pos, soc } = positionBeforeStop(input, plan, stopIndex);
  const route = await fetchRoadRoute(pos, input.destination);
  if ("error" in route) {
    return { error: route.error };
  }

  const usableRange = computeUsableRangeKm(
    soc,
    input.reserveSocPct,
    input.batteryKwh,
    input.efficiencyWhKm
  );
  const driveBeforeChargeKm = Math.min(usableRange * 0.85, route.distanceKm * 0.9);
  const needChargeAt = pointAtDistance(route.coordinates, driveBeforeChargeKm);
  const arrivalSoc = Math.max(
    input.reserveSocPct,
    socAfterDistance(soc, driveBeforeChargeKm, input.batteryKwh, input.efficiencyWhKm)
  );

  const excludeIds = new Set(
    plan.chargeStops.filter((_, i) => i !== stopIndex).map((s) => s.stationId)
  );
  const alternatives = await listCorridorAlternatives(
    needChargeAt,
    input.connectorStandards,
    arrivalSoc,
    input.reserveSocPct,
    excludeIds
  );

  const currentStation = getStationById(plan.chargeStops[stopIndex].stationId);
  const withCurrent =
    currentStation &&
    !alternatives.some((a) => a.station.id === currentStation.id)
      ? [
          {
            station: currentStation,
            distanceKm: haversineKm(
              needChargeAt.lat,
              needChargeAt.lon,
              currentStation.latitude,
              currentStation.longitude
            ),
            score: Number.POSITIVE_INFINITY,
            maxPowerKw: Math.max(
              ...currentStation.connectors
                .filter((c) => input.connectorStandards.includes(c.standard))
                .map((c) => c.maxPowerKw),
              0
            ),
          },
          ...alternatives,
        ]
      : alternatives;

  return {
    needChargeAt,
    arrivalSocPct: arrivalSoc,
    alternatives: withCurrent,
    currentStationId: plan.chargeStops[stopIndex].stationId,
  };
}

/** Replace one charge stop; keep prefix fixed; replan suffix (Req 7.9). */
export async function replaceTripStop(
  input: TripInput,
  plan: TripPlan,
  stopIndex: number,
  newStationId: string
): Promise<TripPlan | { error: string; details?: Record<string, unknown> }> {
  if (stopIndex < 0 || stopIndex >= plan.chargeStops.length) {
    return { error: "INVALID_STOP_INDEX" };
  }

  const station = getStationById(newStationId);
  if (!station) {
    return { error: "STATION_NOT_FOUND" };
  }

  const hasConnector = station.connectors.some((c) =>
    input.connectorStandards.includes(c.standard)
  );
  if (!hasConnector) {
    return { error: "INCOMPATIBLE_STATION" };
  }

  const { pos, soc } = positionBeforeStop(input, plan, stopIndex);
  const legToStation = await fetchRoadRoute(pos, {
    lat: station.latitude,
    lon: station.longitude,
  });
  if ("error" in legToStation) {
    return { error: legToStation.error };
  }

  const prefixStops = plan.chargeStops.slice(0, stopIndex);
  const routeFromStation = await fetchRoadRoute(
    { lat: station.latitude, lon: station.longitude },
    input.destination
  );
  if ("error" in routeFromStation) {
    return { error: routeFromStation.error };
  }

  const arrivalSoc = Math.max(
    input.reserveSocPct,
    socAfterDistance(soc, legToStation.distanceKm, input.batteryKwh, input.efficiencyWhKm)
  );
  const departureSoc = targetDepartureSoc(arrivalSoc, routeFromStation.distanceKm, input);
  const detourKm = haversineKm(pos.lat, pos.lon, station.latitude, station.longitude);

  const replacedStop = buildChargeStop(
    station,
    arrivalSoc,
    departureSoc,
    detourKm,
    input.connectorStandards,
    input.batteryKwh
  );

  return replanWithPrefixStops(input, [...prefixStops, replacedStop], plan.id);
}
