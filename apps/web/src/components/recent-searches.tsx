"use client";

import { Clock } from "lucide-react";
import { recentDestinationLabel, type SavedPlace } from "@/lib/home-storage";

export function RecentSearches({
  places,
  onSelect,
  activePlace,
}: {
  places: SavedPlace[];
  onSelect: (place: SavedPlace) => void;
  activePlace: { lat: number; lon: number } | null;
}) {
  if (places.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-slate-400" />
        <p className="text-sm font-medium text-slate-300">Recent searches</p>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {places.map((place) => {
          const isActive =
            activePlace != null &&
            Math.abs(activePlace.lat - place.lat) < 0.0001 &&
            Math.abs(activePlace.lon - place.lon) < 0.0001;
          return (
            <li key={`${place.lat}-${place.lon}-${place.savedAt}`} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(place)}
                className={`rounded-full border px-4 py-2 text-sm transition min-h-[44px] ${
                  isActive
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-500"
                }`}
              >
                {recentDestinationLabel(place)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
