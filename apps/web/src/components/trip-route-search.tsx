"use client";

import { PlaceSearchField, type GeocodeHit } from "@/components/place-search-field";
import { RecentSearches } from "@/components/recent-searches";
import { Card } from "@/components/ui";
import type { SavedPlace } from "@/lib/home-storage";

interface TripRouteSearchProps {
  destination: GeocodeHit | null;
  onDestinationChange: (hit: GeocodeHit | null) => void;
  origin: GeocodeHit | null;
  onOriginChange: (hit: GeocodeHit | null) => void;
  originLocating: boolean;
  recentSearches: SavedPlace[];
  onRecentSearchSelect: (place: SavedPlace) => void;
  onError: (message: string | null) => void;
  locationBias: { lat: number; lon: number } | null;
  navUserLocation: { lat: number; lon: number } | null;
}

export function TripRouteSearch({
  destination,
  onDestinationChange,
  origin,
  onOriginChange,
  originLocating,
  recentSearches,
  onRecentSearchSelect,
  onError,
  locationBias,
  navUserLocation,
}: TripRouteSearchProps) {
  return (
    <Card className="space-y-5">
      <PlaceSearchField
        id="destination"
        label="Where to?"
        hint="Search your destination"
        placeholder="City, address, or landmark…"
        value={destination}
        onChange={onDestinationChange}
        onError={onError}
        locationBias={origin ?? locationBias}
      />

      <RecentSearches
        places={recentSearches}
        onSelect={onRecentSearchSelect}
        activePlace={destination}
      />

      <div className="border-t border-slate-800 pt-5">
        <PlaceSearchField
          id="origin"
          label="From"
          hint={
            originLocating
              ? "Detecting your location…"
              : "Starting point — tap locate or type another place"
          }
          placeholder="Current location or search a start point…"
          value={origin}
          onChange={onOriginChange}
          onError={onError}
          showLocateMe
          locationBias={navUserLocation ?? origin}
        />
      </div>
    </Card>
  );
}
