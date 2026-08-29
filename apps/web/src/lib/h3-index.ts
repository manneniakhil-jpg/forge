import { gridDisk, latLngToCell } from "h3-js";

/** H3 resolution 7 — ~5.16 km² hexagons, aligned with Ev_maps DD-4 */
export const H3_RESOLUTION = 7;

/** Approximate great-circle km per grid ring at res 7 */
const KM_PER_RING = 2.4;

export function cellForCoordinates(lat: number, lon: number): string {
  return latLngToCell(lat, lon, H3_RESOLUTION);
}

/** Cells whose centers fall within radiusKm of the search point (plus margin). */
export function coveringCellIndexes(lat: number, lon: number, radiusKm: number): string[] {
  const center = cellForCoordinates(lat, lon);
  const k = Math.min(64, Math.max(1, Math.ceil(radiusKm / KM_PER_RING)));
  return gridDisk(center, k);
}
