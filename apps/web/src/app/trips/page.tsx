"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Route } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { TripNavigationPanel } from "@/components/trip-navigation-panel";
import { PlaceSearchField, type GeocodeHit } from "@/components/place-search-field";
import { getCurrentLocation } from "@/lib/geolocation";
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

const POPULAR_ORIGINS = [
  "San Francisco, California",
  "San Jose, California",
  "Oakland, California",
  "Los Angeles, California",
  "Seattle, Washington",
];

const POPULAR_DESTINATIONS = [
  "San Diego, California",
  "Los Angeles, California",
  "Las Vegas, Nevada",
  "Sacramento, California",
  "Lake Tahoe, California",
  "Monterey, California",
  "Portland, Oregon",
  "Seattle, Washington",
  "Denver, Colorado",
];

export default function TripsPage() {
  const router = useRouter();
  const [departureSoc, setDepartureSoc] = useState("80");
  const [reserveSoc, setReserveSoc] = useState("10");
  const [origin, setOrigin] = useState<GeocodeHit | null>(null);
  const [destination, setDestination] = useState<GeocodeHit | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [navUserLocation, setNavUserLocation] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originLoading, setOriginLoading] = useState(true);

  useEffect(() => {
    if (!getAuthToken()) router.replace("/auth");

    let cancelled = false;
    const sfDefault: GeocodeHit = {
      lat: 37.7749,
      lon: -122.4194,
      label: "San Francisco, California, United States",
    };

    void (async () => {
      try {
        const point = await getCurrentLocation();
        if (cancelled) return;
        setOrigin({
          lat: point.lat,
          lon: point.lon,
          label: "Current location",
        });
      } catch {
        if (cancelled) return;
        setOrigin(sfDefault);
      } finally {
        if (!cancelled) setOriginLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const planTrip = async () => {
    setError(null);
    let from = origin;
    let to = destination;

    if (!from) {
      setError("Choose a starting point.");
      return;
    }
    if (!to) {
      setError("Choose a destination from the search results.");
      return;
    }

    setLoading(true);
    setPlan(null);
    setNavUserLocation(null);
    try {
      const data = await apiFetch<{ plan: TripPlan }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          origin: { lat: from.lat, lon: from.lon, label: from.label },
          destination: { lat: to.lat, lon: to.lon, label: to.label },
          departureSocPct: parseInt(departureSoc),
          reserveSocPct: parseInt(reserveSoc),
        }),
      });
      setPlan(data.plan);
    } catch (e) {
      const err = e as { message?: string; code?: string; fields?: Record<string, string> };
      if (err.code === "NO_VIABLE_ROUTE") {
        if (err.fields?.reason === "no_chargers_on_route") {
          setError(
            "No compatible chargers found along this route yet. Try a route within California, or a shorter distance."
          );
        } else {
          setError(
            "This trip exceeds your range even with charging stops. Try a closer destination or start with more charge."
          );
        }
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
        <p className="text-slate-400">Set your start and end — search any city or address</p>
      </div>

      <Card className="space-y-5">
        <div className="relative z-30">
          <PlaceSearchField
            id="origin"
            label="From"
            hint={
              originLoading
                ? "Detecting your location…"
                : "Starting point — defaults to your location, but you can change it"
            }
            placeholder="Search starting city or address…"
            value={origin}
            onChange={setOrigin}
            onError={setError}
            quickPicks={POPULAR_ORIGINS}
            quickPicksLabel="Popular starting points"
            showLocateMe
          />
        </div>

        <div className="relative z-20">
          <PlaceSearchField
            id="destination"
            label="To"
            hint="Type any place worldwide"
            placeholder="Search destination city or address…"
            value={destination}
            onChange={setDestination}
            onError={setError}
            quickPicks={POPULAR_DESTINATIONS}
            quickPicksLabel="Popular destinations"
          />
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

        <Button className="w-full" onClick={planTrip} disabled={loading || !origin || !destination}>
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

          <TripRouteMap plan={plan} userLocation={navUserLocation} />

          <TripNavigationPanel
            plan={plan}
            userLocation={navUserLocation}
            onUserLocationChange={setNavUserLocation}
          />

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
