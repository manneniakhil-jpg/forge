"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Route, MapPin, Search } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { apiFetch, getAuthToken } from "@/lib/utils";
import type { TripPlan } from "@ev/domain";

const TripRouteMap = dynamic(
  () => import("@/components/trip-route-map").then((m) => m.TripRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center rounded-2xl bg-slate-900 text-slate-400">
        Loading map…
      </div>
    ),
  }
);

const POPULAR_DESTINATIONS = [
  "San Diego, California",
  "Los Angeles, California",
  "Las Vegas, Nevada",
  "Sacramento, California",
  "Lake Tahoe, California",
  "Monterey, California",
  "Fresno, California",
  "Portland, Oregon",
  "Seattle, Washington",
  "Phoenix, Arizona",
  "Denver, Colorado",
  "Salt Lake City, Utah",
];

interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
}

async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Search failed");
  return data.results ?? [];
}

export default function TripsPage() {
  const router = useRouter();
  const [departureSoc, setDepartureSoc] = useState("80");
  const [reserveSoc, setReserveSoc] = useState("10");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<GeocodeHit | null>(null);
  const [searchResults, setSearchResults] = useState<GeocodeHit[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!getAuthToken()) router.replace("/auth");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setOrigin({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label: "Current location",
          });
        },
        () => setOrigin({ lat: 37.7749, lon: -122.4194, label: "San Francisco" })
      );
    }
  }, [router]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const runSearch = useCallback(async (query: string, autoSelectFirst = false): Promise<GeocodeHit | null> => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return null;
    }
    setSearching(true);
    setError(null);
    try {
      const results = await searchPlaces(query);
      setSearchResults(results);
      setShowResults(true);
      if (results.length === 0) {
        setDestination(null);
        setError("No places found. Try a city, zip code, or full address.");
        return null;
      }
      if (autoSelectFirst) {
        setDestination(results[0]);
        setDestinationQuery(results[0].label.split(",").slice(0, 2).join(","));
        setShowResults(false);
        return results[0];
      }
      return null;
    } catch {
      setError("Place search failed. Check your connection and try again.");
      return null;
    } finally {
      setSearching(false);
    }
  }, []);

  const onQueryChange = (value: string) => {
    setDestinationQuery(value);
    setDestination(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 450);
  };

  const selectDestination = (hit: GeocodeHit) => {
    setDestination(hit);
    setDestinationQuery(hit.label.split(",").slice(0, 3).join(","));
    setShowResults(false);
    setError(null);
  };

  const planTrip = async () => {
    if (!origin) return;
    let dest = destination;
    if (!dest) {
      dest = await runSearch(destinationQuery, true);
    }
    if (!dest) {
      setError("Pick a destination from the search results first.");
      return;
    }

    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const data = await apiFetch<{ plan: TripPlan }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination: { lat: dest.lat, lon: dest.lon, label: dest.label },
          departureSocPct: parseInt(departureSoc),
          reserveSocPct: parseInt(reserveSoc),
        }),
      });
      setPlan(data.plan);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      if (err.code === "NO_VIABLE_ROUTE") {
        setError(
          "No viable route with your current charge and vehicle range. Try a closer destination or higher departure charge."
        );
      } else if (err.code === "ROUTING_UNAVAILABLE") {
        setError("Road routing is temporarily unavailable. Please try again in a moment.");
      } else {
        setError(err.message || "Could not plan trip");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Plan a trip</h1>
        <p className="text-slate-400">Search any city or address — not limited to presets</p>
      </div>

      <Card className="space-y-4">
        <div ref={searchRef} className="relative">
          <Label htmlFor="destination">Destination</Label>
          <p className="mb-2 text-xs text-slate-500">
            Type any place worldwide — e.g. &quot;Austin TX&quot;, &quot;1600 Amphitheatre Parkway&quot;
          </p>
          <div className="flex gap-2">
            <Input
              id="destination"
              value={destinationQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch(destinationQuery, true);
                }
              }}
              placeholder="Search city, address, or landmark…"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => runSearch(destinationQuery)}
              disabled={searching || destinationQuery.trim().length < 2}
              aria-label="Search destination"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {showResults && searchResults.length > 0 && (
            <ul
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 shadow-xl"
              role="listbox"
              aria-label="Destination search results"
            >
              {searchResults.map((hit) => (
                <li key={`${hit.lat}-${hit.lon}`}>
                  <button
                    type="button"
                    role="option"
                    onClick={() => selectDestination(hit)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-slate-800 border-b border-slate-800 last:border-0 min-h-[44px]"
                  >
                    {hit.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searching && (
            <p className="mt-2 text-xs text-slate-500">Searching…</p>
          )}

          {destination && !showResults && (
            <p className="mt-2 text-sm text-emerald-300/90 line-clamp-2">
              Selected: {destination.label}
            </p>
          )}

          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">Popular trips</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_DESTINATIONS.map((place) => (
                <button
                  key={place}
                  type="button"
                  onClick={() => {
                    setDestinationQuery(place);
                    runSearch(place, true);
                  }}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-emerald-600 hover:text-emerald-300 min-h-[32px]"
                >
                  {place.split(",")[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="departureSoc">Departure charge (%)</Label>
            <Input
              id="departureSoc"
              type="number"
              min={1}
              max={100}
              value={departureSoc}
              onChange={(e) => setDepartureSoc(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reserveSoc">Reserve charge (%)</Label>
            <Input
              id="reserveSoc"
              type="number"
              min={5}
              max={40}
              value={reserveSoc}
              onChange={(e) => setReserveSoc(e.target.value)}
            />
          </div>
        </div>
        {origin && (
          <p className="text-sm text-slate-400">
            <MapPin className="inline h-4 w-4 mr-1" />
            From: {origin.label}
          </p>
        )}
        <Button
          className="w-full"
          onClick={planTrip}
          disabled={loading || !origin || destinationQuery.trim().length < 2}
        >
          {loading ? "Planning route…" : "Plan trip"}
        </Button>
      </Card>

      {error && (
        <p className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {plan && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Your trip plan</h2>
          </div>

          <TripRouteMap plan={plan} />

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-slate-400">Distance</p>
              <p className="font-semibold">{plan.totalDistanceKm} km</p>
            </div>
            <div>
              <p className="text-slate-400">Drive time</p>
              <p className="font-semibold">{plan.totalDrivingMin} min</p>
            </div>
            <div>
              <p className="text-slate-400">Charging</p>
              <p className="font-semibold">{plan.totalChargingMin} min</p>
            </div>
            <div>
              <p className="text-slate-400">Arrival charge</p>
              <p className="font-semibold">{plan.destinationSocPct}%</p>
            </div>
          </div>

          {plan.chargeStops.length === 0 ? (
            <p className="text-sm text-emerald-300">No charging stops needed — you have enough range!</p>
          ) : (
            <ol className="space-y-3">
              {plan.chargeStops.map((stop, i) => (
                <li key={stop.stationId} className="rounded-xl border border-slate-700 p-3">
                  <p className="font-medium">
                    Stop {i + 1}: {stop.stationName}
                  </p>
                  <p className="text-sm text-slate-400">
                    Arrive {stop.arrivalSocPct}% → Depart {stop.departureSocPct}% ·{" "}
                    {stop.chargingDurationMin} min
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}
