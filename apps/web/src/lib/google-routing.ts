const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

type LatLng = { latitude: number; longitude: number };

export type GoogleRoutePoint = { lat: number; lon: number };

export type GoogleRouteLeg = {
  distanceM: number;
  durationS: number;
  steps: Array<{
    instruction: string;
    distanceM: number;
    durationS: number;
    roadName: string;
    maneuverType: string;
    maneuverModifier?: string;
    location: GoogleRoutePoint;
  }>;
};

export type GoogleRouteResult = {
  distanceKm: number;
  durationMin: number;
  staticDurationMin: number;
  coordinates: GoogleRoutePoint[];
  legs: GoogleRouteLeg[];
  source: "google_routes";
};

export function isGoogleRoutingConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

function parseDurationSeconds(value?: string): number {
  if (!value) return 0;
  const seconds = parseFloat(value.replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds : 0;
}

/** Decode Google's encoded polyline (precision 5). */
export function decodeEncodedPolyline(encoded: string): GoogleRoutePoint[] {
  const coordinates: GoogleRoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += deltaLon;

    coordinates.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }

  return coordinates;
}

function latLngWaypoint(point: GoogleRoutePoint) {
  return {
    location: {
      latLng: {
        latitude: point.lat,
        longitude: point.lon,
      } satisfies LatLng,
    },
  };
}

function mapManeuver(maneuver?: string): { type: string; modifier?: string } {
  switch (maneuver) {
    case "DEPART":
      return { type: "depart" };
    case "ARRIVE":
      return { type: "arrive" };
    case "TURN_LEFT":
      return { type: "turn", modifier: "left" };
    case "TURN_RIGHT":
      return { type: "turn", modifier: "right" };
    case "TURN_SLIGHT_LEFT":
      return { type: "turn", modifier: "slight left" };
    case "TURN_SLIGHT_RIGHT":
      return { type: "turn", modifier: "slight right" };
    case "TURN_SHARP_LEFT":
      return { type: "turn", modifier: "sharp left" };
    case "TURN_SHARP_RIGHT":
      return { type: "turn", modifier: "sharp right" };
    case "UTURN_LEFT":
    case "UTURN_RIGHT":
      return { type: "turn", modifier: "uturn" };
    case "MERGE":
      return { type: "merge" };
    case "FORK_LEFT":
      return { type: "fork", modifier: "left" };
    case "FORK_RIGHT":
      return { type: "fork", modifier: "right" };
    case "ROUNDABOUT_LEFT":
    case "ROUNDABOUT_RIGHT":
      return { type: "roundabout" };
    case "STRAIGHT":
    case "NAME_CHANGE":
      return { type: "continue" };
    default:
      return { type: "continue" };
  }
}

function extractRoadName(instruction: string): string {
  const onto = instruction.match(/\bonto (.+)$/i);
  if (onto) return onto[1];
  const on = instruction.match(/\bon (.+)$/i);
  if (on) return on[1];
  return "";
}

export async function computeGoogleRoute(
  origin: GoogleRoutePoint,
  destination: GoogleRoutePoint,
  intermediates: GoogleRoutePoint[] = []
): Promise<GoogleRouteResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    origin: latLngWaypoint(origin),
    destination: latLngWaypoint(destination),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    languageCode: "en-US",
    units: "METRIC",
  };

  if (intermediates.length > 0) {
    body.intermediates = intermediates.map(latLngWaypoint);
  }

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "routes.duration",
        "routes.staticDuration",
        "routes.distanceMeters",
        "routes.polyline.encodedPolyline",
        "routes.legs.duration",
        "routes.legs.staticDuration",
        "routes.legs.distanceMeters",
        "routes.legs.steps.distanceMeters",
        "routes.legs.steps.staticDuration",
        "routes.legs.steps.navigationInstruction",
        "routes.legs.steps.startLocation",
      ].join(","),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[routing] Google Routes error:", res.status, detail.slice(0, 300));
    return null;
  }

  const data = (await res.json()) as {
    routes?: Array<{
      duration?: string;
      staticDuration?: string;
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      legs?: Array<{
        duration?: string;
        staticDuration?: string;
        distanceMeters?: number;
        steps?: Array<{
          distanceMeters?: number;
          staticDuration?: string;
          startLocation?: { latLng?: LatLng };
          navigationInstruction?: { maneuver?: string; instructions?: string };
        }>;
      }>;
    }>;
  };

  const route = data.routes?.[0];
  if (!route) return null;

  const durationS = parseDurationSeconds(route.duration);
  const staticDurationS = parseDurationSeconds(route.staticDuration || route.duration);
  const encoded = route.polyline?.encodedPolyline ?? "";
  const coordinates = encoded ? decodeEncodedPolyline(encoded) : [origin, destination];

  const legs: GoogleRouteLeg[] = (route.legs ?? []).map((leg) => ({
    distanceM: leg.distanceMeters ?? 0,
    durationS: parseDurationSeconds(leg.duration || leg.staticDuration),
    steps: (leg.steps ?? []).map((step) => {
      const maneuver = mapManeuver(step.navigationInstruction?.maneuver);
      const instruction = step.navigationInstruction?.instructions ?? "Continue";
      return {
        instruction,
        distanceM: step.distanceMeters ?? 0,
        durationS: parseDurationSeconds(step.staticDuration),
        roadName: extractRoadName(instruction),
        maneuverType: maneuver.type,
        maneuverModifier: maneuver.modifier,
        location: {
          lat: step.startLocation?.latLng?.latitude ?? origin.lat,
          lon: step.startLocation?.latLng?.longitude ?? origin.lon,
        },
      };
    }),
  }));

  return {
    distanceKm: (route.distanceMeters ?? 0) / 1000,
    durationMin: Math.round(durationS / 60),
    staticDurationMin: Math.round(staticDurationS / 60),
    coordinates,
    legs,
    source: "google_routes",
  };
}
