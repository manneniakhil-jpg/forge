"use client";

import { useEffect, useState } from "react";
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

const QUICK_DESTINATIONS = [
  "Los Angeles, California",
  "Sacramento, California",
  "Lake Tahoe, California",
  "Monterey, California",
  "Portland, Oregon",
];

interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
}

export default function TripsPage() {
  const router = useRouter();
  const [departureSoc, setDepartureSoc] = useState("80");
  const [reserveSoc, setReserveSoc] = useState("10");
  const [destinationQuery, setDestinationQuery] = useState("Los Angeles, California");
  const [destination, setDestination] = useState<GeocodeHit | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const resolveDestination = async (query: string) => {
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<{ results: GeocodeHit[] }>(
        `/api/geocode?q=${encodeURIComponent(query)}`
      );
      if (data.results.length > 0) {
        setDestination(data.results[0]);
      } else {
        setDestination(null);
        setError("Could not find that place. Try a city name or address.");
      }
    } catch {
      setError("Place search failed. Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    resolveDestination(QUICK_DESTINATIONS[0]);
  }, []);

  const planTrip = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const data = await apiFetch<{ plan: TripPlan }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination: {
            lat: destination.lat,
            lon: destination.lon,
            label: destination.label,
          },
          departureSocPct: parseInt(departureSoc),
          reserveSocPct: parseInt(reserveSoc),
        }),
      });
      setPlan(data.plan);
    } catch (e) {
      const err = e as { message?: string; code?: string; fields?: Record<string, unknown> };
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
        <p className="text-slate-400">Real road routes with charge stops along the way</p>
      </div>

      <Card className="space-y-4">
        <div>
          <Label htmlFor="destination">Destination</Label>
          <div className="flex gap-2">
            <Input
              id="destination"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              placeholder="City or address"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => resolveDestination(destinationQuery)}
              disabled={searching}
              aria-label="Search destination"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_DESTINATIONS.map((place) => (
              <button
                key={place}
                type="button"
                onClick={() => {
                  setDestinationQuery(place);
                  resolveDestination(place);
                }}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-emerald-600 min-h-[32px]"
              >
                {place.split(",")[0]}
              </button>
            ))}
          </div>
          {destination && (
            <p className="mt-2 text-sm text-emerald-300/90 truncate">{destination.label}</p>
          )}
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
