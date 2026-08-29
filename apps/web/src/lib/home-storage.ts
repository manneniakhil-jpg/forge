export type SavedPlace = {
  lat: number;
  lon: number;
  label: string;
  savedAt: string;
};

const RECENT_DEST_KEY = "ev_recent_destination";

export function saveRecentDestination(place: Omit<SavedPlace, "savedAt">): void {
  if (typeof window === "undefined") return;
  const payload: SavedPlace = { ...place, savedAt: new Date().toISOString() };
  localStorage.setItem(RECENT_DEST_KEY, JSON.stringify(payload));
}

export function loadRecentDestination(): SavedPlace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RECENT_DEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPlace;
    if (parsed.lat == null || parsed.lon == null || !parsed.label) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recentDestinationLabel(place: SavedPlace): string {
  return place.label.split(",").slice(0, 2).join(",").trim();
}
