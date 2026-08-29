import { haversineKm } from "@ev/domain";

const OSRM_BASE = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";

export interface RoadRoute {
  distanceKm: number;
  durationMin: number;
  coordinates: Array<{ lat: number; lon: number }>;
}

export interface OsrmManeuver {
  type: string;
  modifier?: string;
  location: { lat: number; lon: number };
}

export interface OsrmStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: OsrmManeuver;
}

export interface OsrmLeg {
  steps: OsrmStep[];
  distance: number;
  duration: number;
}

export interface RoadRouteWithSteps extends RoadRoute {
  legs: OsrmLeg[];
}

type OsrmRouteJson = {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: { coordinates: Array<[number, number]> };
    legs?: Array<{
      distance: number;
      duration: number;
      steps?: Array<{
        name?: string;
        distance: number;
        duration: number;
        maneuver: {
          type: string;
          modifier?: string;
          location: [number, number];
        };
      }>;
    }>;
  }>;
};

function parseOsrmRoute(
  route: NonNullable<OsrmRouteJson["routes"]>[0],
  fallback: Array<{ lat: number; lon: number }>
): RoadRouteWithSteps {
  const coords = (route.geometry?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon }));
  const coordinates = coords.length > 0 ? coords : fallback;

  const legs: OsrmLeg[] = (route.legs ?? []).map((leg) => ({
    distance: leg.distance,
    duration: leg.duration,
    steps: (leg.steps ?? []).map((step) => ({
      name: step.name ?? "",
      distance: step.distance,
      duration: step.duration,
      maneuver: {
        type: step.maneuver.type,
        modifier: step.maneuver.modifier,
        location: {
          lat: step.maneuver.location[1],
          lon: step.maneuver.location[0],
        },
      },
    })),
  }));

  return {
    coordinates: simplifyCoordinates(coordinates, 500),
    distanceKm: route.distance / 1000,
    durationMin: Math.round(route.duration / 60),
    legs,
  };
}

function buildOsrmUrl(points: Array<{ lat: number; lon: number }>, steps: boolean): string {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  return `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=${steps ? "true" : "false"}`;
}

export async function fetchRoadRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<RoadRoute | { error: string }> {
  const url = `${OSRM_BASE}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return { error: "ROUTING_UNAVAILABLE" };

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      return { error: "INVALID_TRIP_INPUT" };
    }

    const route = data.routes[0];
    const coords = (route.geometry.coordinates as Array<[number, number]>).map(
      ([lon, lat]) => ({ lat, lon })
    );

    return {
      distanceKm: route.distance / 1000,
      durationMin: Math.round(route.duration / 60),
      coordinates: simplifyCoordinates(coords, 150),
    };
  } catch {
    return { error: "ROUTING_UNAVAILABLE" };
  }
}

export async function fetchRoadRouteWithSteps(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  waypoints: Array<{ lat: number; lon: number }> = []
): Promise<RoadRouteWithSteps | { error: string }> {
  const points = [origin, ...waypoints, destination];
  const url = buildOsrmUrl(points, true);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return { error: "ROUTING_UNAVAILABLE" };

    const data = (await res.json()) as OsrmRouteJson;
    if (data.code !== "Ok" || !data.routes?.[0]) {
      return { error: "INVALID_TRIP_INPUT" };
    }

    return parseOsrmRoute(data.routes[0], points);
  } catch {
    return { error: "ROUTING_UNAVAILABLE" };
  }
}

function simplifyCoordinates(
  coords: Array<{ lat: number; lon: number }>,
  maxPoints: number
): Array<{ lat: number; lon: number }> {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const result: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < coords.length; i += step) {
    result.push(coords[i]);
  }
  const last = coords[coords.length - 1];
  const tail = result[result.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lon !== last.lon) result.push(last);
  return result;
}

export function findRouteIndexAtDistance(
  coordinates: Array<{ lat: number; lon: number }>,
  targetKm: number
): number {
  let accumulated = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const seg = haversineKm(
      coordinates[i - 1].lat,
      coordinates[i - 1].lon,
      coordinates[i].lat,
      coordinates[i].lon
    );
    if (accumulated + seg >= targetKm) return i;
    accumulated += seg;
  }
  return coordinates.length - 1;
}

export function pointAtDistance(
  coordinates: Array<{ lat: number; lon: number }>,
  targetKm: number
): { lat: number; lon: number } {
  const idx = findRouteIndexAtDistance(coordinates, targetKm);
  return coordinates[idx] ?? coordinates[coordinates.length - 1];
}

export function mergeRouteSegments(segments: Array<Array<{ lat: number; lon: number }>>) {
  const merged: Array<{ lat: number; lon: number }> = [];
  for (const segment of segments) {
    for (const point of segment) {
      const prev = merged[merged.length - 1];
      if (prev && prev.lat === point.lat && prev.lon === point.lon) continue;
      merged.push(point);
    }
  }
  return merged;
}

export function socAfterDistance(
  startSoc: number,
  distanceKm: number,
  batteryKwh: number,
  efficiencyWhKm: number
): number {
  const loss = (distanceKm * efficiencyWhKm) / ((batteryKwh * 1000) / 100);
  return Math.round(startSoc - loss);
}
