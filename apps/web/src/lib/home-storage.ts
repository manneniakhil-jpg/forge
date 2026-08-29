export type SavedPlace = {
  lat: number;
  lon: number;
  label: string;
  savedAt: string;
};

const RECENT_DEST_KEY = "ev_recent_destination";
const RECENT_DESTINATIONS_KEY = "ev_recent_destinations";
const MAX_RECENT_DESTINATIONS = 5;

function placeKey(place: Pick<SavedPlace, "lat" | "lon">): string {
  return `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
}

function parseSavedPlace(raw: unknown): SavedPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as SavedPlace;
  if (parsed.lat == null || parsed.lon == null || !parsed.label) return null;
  return parsed;
}

export function saveRecentDestination(place: Omit<SavedPlace, "savedAt">): void {
  if (typeof window === "undefined") return;
  const payload: SavedPlace = { ...place, savedAt: new Date().toISOString() };
  const key = placeKey(place);
  const existing = loadRecentDestinations().filter((item) => placeKey(item) !== key);
  const next = [payload, ...existing].slice(0, MAX_RECENT_DESTINATIONS);
  localStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(next));
  localStorage.setItem(RECENT_DEST_KEY, JSON.stringify(payload));
}

export function loadRecentDestinations(): SavedPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const rawList = localStorage.getItem(RECENT_DESTINATIONS_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList) as unknown[];
      if (Array.isArray(parsed)) {
        return parsed
          .map(parseSavedPlace)
          .filter((item): item is SavedPlace => item !== null)
          .slice(0, MAX_RECENT_DESTINATIONS);
      }
    }

    const legacy = localStorage.getItem(RECENT_DEST_KEY);
    if (!legacy) return [];
    const parsed = parseSavedPlace(JSON.parse(legacy));
    return parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

export function loadRecentDestination(): SavedPlace | null {
  return loadRecentDestinations()[0] ?? null;
}

export function recentDestinationLabel(place: SavedPlace): string {
  return place.label.split(",").slice(0, 2).join(",").trim();
}
