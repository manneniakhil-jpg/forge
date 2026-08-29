"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Route, MapPin } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { apiFetch, getAuthToken } from "@/lib/utils";
import type { TripPlan } from "@ev/domain";

const DESTINATIONS = [
  { label: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 },
  { label: "Sacramento, CA", lat: 38.5816, lon: -121.4944 },
  { label: "Portland, OR", lat: 45.5152, lon: -122.6784 },
  { label: "Lake Tahoe", lat: 39.0968, lon: -120.0324 },
  { label: "Monterey, CA", lat: 36.6002, lon: -121.8947 },
];

export default function TripsPage() {
  const router = useRouter();
  const [departureSoc, setDepartureSoc] = useState("80");
  const [reserveSoc, setReserveSoc] = useState("10");
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [origin, setOrigin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) router.replace("/auth");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: "Current location",
        });
      }, () => {
        setOrigin({ lat: 37.7749, lon: -122.4194, label: "San Francisco" });
      });
    }
  }, [router]);

  const planTrip = async () => {
    if (!origin) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const data = await apiFetch<{ plan: TripPlan }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination: { lat: destination.lat, lon: destination.lon, label: destination.label },
          departureSocPct: parseInt(departureSoc),
          reserveSocPct: parseInt(reserveSoc),
        }),
      });
      setPlan(data.plan);
    } catch (e) {
      const err = e as { message?: string; code?: string; fields?: Record<string, unknown> };
      if (err.code === "NO_VIABLE_ROUTE") {
        setError(
          `No viable route found. Longest leg exceeds usable range (${JSON.stringify(err.fields ?? {})}).`
        );
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
        <p className="text-slate-400">Get a route with the charge stops you need</p>
      </div>

      <Card className="space-y-4">
        <div>
          <Label htmlFor="destination">Destination</Label>
          <select
            id="destination"
            className="h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3"
            value={destination.label}
            onChange={(e) => {
              const d = DESTINATIONS.find((x) => x.label === e.target.value);
              if (d) setDestination(d);
            }}
          >
            {DESTINATIONS.map((d) => (
              <option key={d.label} value={d.label}>{d.label}</option>
            ))}
          </select>
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
        <Button className="w-full" onClick={planTrip} disabled={loading || !origin}>
          {loading ? "Planning route…" : "Plan trip"}
        </Button>
      </Card>

      {error && (
        <p className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {plan && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Route className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Your trip plan</h2>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
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
                  <p className="font-medium">Stop {i + 1}: {stop.stationName}</p>
                  <p className="text-sm text-slate-400">
                    Arrive {stop.arrivalSocPct}% → Depart {stop.departureSocPct}% · {stop.chargingDurationMin} min
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
