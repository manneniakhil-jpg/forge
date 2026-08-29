type Coord = { lat: number; lon: number };

function formatCoord({ lat, lon }: Coord): string {
  return `${lat},${lon}`;
}

/** Open turn-by-turn navigation in Google Maps (works on web and mobile). */
export function googleMapsNavigationUrl(
  origin: Coord,
  destination: Coord,
  waypoints: Coord[] = [],
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: formatCoord(origin),
    destination: formatCoord(destination),
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(formatCoord).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Open navigation in Apple Maps (best on iPhone, iPad, and Mac). */
export function appleMapsNavigationUrl(
  origin: Coord,
  destination: Coord,
  waypoints: Coord[] = [],
): string {
  const params = new URLSearchParams({
    saddr: formatCoord(origin),
    daddr: formatCoord(destination),
    dirflg: "d",
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(formatCoord).join("|"));
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

/** Navigate a single leg (e.g. to the next charge stop). */
export function googleMapsSegmentUrl(from: Coord, to: Coord): string {
  return googleMapsNavigationUrl(from, to, []);
}
