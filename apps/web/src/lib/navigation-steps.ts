import type { TripPlan } from "@ev/domain";
import { fetchRoadRouteWithSteps } from "@/lib/routing";
import {
  appleMapsNavigationUrl,
  googleMapsNavigationUrl,
} from "@/lib/navigation-links";

type Coord = { lat: number; lon: number };

export type NavigationManeuver = {
  type: string;
  modifier?: string;
  location: Coord;
};

export type NavigationStep = {
  instruction: string;
  distanceM: number;
  durationS: number;
  roadName: string;
  maneuver: NavigationManeuver;
};

export type TripNavigation = {
  steps: NavigationStep[];
  totalDistanceKm: number;
  totalDurationMin: number;
  googleMapsUrl: string;
  appleMapsUrl: string;
};

function haversineM(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function maneuverInstruction(
  type: string,
  modifier: string | undefined,
  roadName: string,
): string {
  const road = roadName ? ` onto ${roadName}` : "";
  switch (type) {
    case "depart":
      return `Head ${modifier ?? "straight"}${road}`;
    case "arrive":
      return "You have arrived at your destination";
    case "turn":
      if (modifier === "left") return `Turn left${road}`;
      if (modifier === "right") return `Turn right${road}`;
      if (modifier === "slight left") return `Slight left${road}`;
      if (modifier === "slight right") return `Slight right${road}`;
      if (modifier === "sharp left") return `Sharp left${road}`;
      if (modifier === "sharp right") return `Sharp right${road}`;
      if (modifier === "uturn") return `Make a U-turn${road}`;
      return `Continue${road}`;
    case "continue":
    case "new name":
      return `Continue${road}`;
    case "merge":
      return `Merge${modifier ? ` ${modifier}` : ""}${road}`;
    case "on ramp":
      return `Take the ramp${modifier ? ` ${modifier}` : ""}${road}`;
    case "off ramp":
      return `Take the exit${modifier ? ` ${modifier}` : ""}${road}`;
    case "fork":
      if (modifier === "left") return `Keep left at the fork${road}`;
      if (modifier === "right") return `Keep right at the fork${road}`;
      return `Keep straight at the fork${road}`;
    case "roundabout":
    case "rotary":
      return `At the roundabout, take the exit${road}`;
    case "roundabout turn":
      return `At the roundabout, turn ${modifier ?? "straight"}${road}`;
    case "end of road":
      if (modifier === "left") return `At the end of the road, turn left${road}`;
      if (modifier === "right") return `At the end of the road, turn right${road}`;
      return `At the end of the road, continue${road}`;
    default:
      return roadName ? `Continue on ${roadName}` : "Continue";
  }
}

export function navigationUrlsForPlan(plan: TripPlan) {
  const waypoints = plan.chargeStops.map((s) => ({
    lat: s.latitude,
    lon: s.longitude,
  }));
  return {
    googleMapsUrl: googleMapsNavigationUrl(plan.origin, plan.destination, waypoints),
    appleMapsUrl: appleMapsNavigationUrl(plan.origin, plan.destination, waypoints),
  };
}

export async function buildTripNavigation(plan: TripPlan): Promise<TripNavigation | null> {
  const waypoints = plan.chargeStops.map((s) => ({
    lat: s.latitude,
    lon: s.longitude,
  }));
  const urls = navigationUrlsForPlan(plan);
  const route = await fetchRoadRouteWithSteps(plan.origin, plan.destination, waypoints);
  if (!route || "error" in route) return null;

  const steps: NavigationStep[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      steps.push({
        instruction:
          step.instruction ??
          maneuverInstruction(step.maneuver.type, step.maneuver.modifier, step.name),
        distanceM: step.distance,
        durationS: step.duration,
        roadName: step.name,
        maneuver: step.maneuver,
      });
    }
  }

  return {
    steps,
    totalDistanceKm: route.distanceKm,
    totalDurationMin: route.durationMin,
    googleMapsUrl: urls.googleMapsUrl,
    appleMapsUrl: urls.appleMapsUrl,
  };
}

/** Index of the next step the driver should follow based on GPS position. */
export function activeStepIndex(steps: NavigationStep[], userLocation: Coord): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = haversineM(userLocation, steps[i].maneuver.location);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestDist < 40 && bestIdx < steps.length - 1) {
    return bestIdx + 1;
  }
  return bestIdx;
}
