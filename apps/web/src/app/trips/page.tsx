"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Route } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { ChargeStopPicker } from "@/components/charge-stop-picker";
import { TripNavigationPanel } from "@/components/trip-navigation-panel";
import { PlaceSearchField, type GeocodeHit } from "@/components/place-search-field";
import { chargeStopReason } from "@/lib/trip-station-scoring";
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

function originLabel(origin: GeocodeHit | null): string {
  if (!origin) return "Getting your location…";
  if (origin.label === "Current location") return "Current location";
  return origin.label.split(",").slice(0, 2).join(",");
}

function destinationLabel(destination: GeocodeHit | null): string {
  if (!destination) return "";
  return destination.label.split(",").slice(0, 2).join(",");
}

export default function TripsPage() {
  const router = useRouter();
  const [departureSoc, setDepartureSoc] = useState("80");
  const [reserveSoc, setReserveSoc] = useState("10");
  const [origin, setOrigin] = useState<GeocodeHit | null>(null);
  const [destination, setDestination] = useState<GeocodeHit | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [planOptions, setPlanOptions] = useState<TripPlan[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [navUserLocation, setNavUserLocation] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originLocating, setOriginLocating] = useState(true);
  const [swapStopIndex, setSwapStopIndex] = useState<number | null>(null);
  const planRequestRef = useRef(0);
  const departureSocRef = useRef(departureSoc);
  const reserveSocRef = useRef(reserveSoc);
  departureSocRef.current = departureSoc;
  reserveSocRef.current = reserveSoc;

  useEffect(() => {
    if (!getAuthToken()) router.replace("/auth");

    let cancelled = false;

    void (async () => {
      try {
        const me = await apiFetch<{
          activeVehicle: { id: string } | null;
          account: { reserveSoc: number };
        }>("/api/me");
        if (cancelled) return;
        setReserveSoc(String(me.account.reserveSoc ?? 10));
        if (me.activeVehicle) {
          const vehicle = await apiFetch<{ state: { socPct: number | null } }>(
            `/api/vehicles/${me.activeVehicle.id}`
          );
          if (!cancelled && vehicle.state.socPct != null) {
            setDepartureSoc(String(Math.round(vehicle.state.socPct)));
          }
        }
      } catch {
        // Keep defaults.
      }
    })();

    void (async () => {
      try {
        const point = await getCurrentLocation();
        if (cancelled) return;
        const hit: GeocodeHit = {
          lat: point.lat,
          lon: point.lon,
          label: "Current location",
        };
        setOrigin(hit);
        setNavUserLocation(point);
      } catch {
        if (cancelled) return;
        setOrigin({
          lat: 37.7749,
          lon: -122.4194,
          label: "San Francisco, California, United States",
        });
        setError("Could not detect your location — using San Francisco as the starting point.");
      } finally {
        if (!cancelled) setOriginLocating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const runPlan = useCallback(
    async (from: GeocodeHit, to: GeocodeHit) => {
      const requestId = ++planRequestRef.current;
      setLoading(true);
      setError(null);
      setPlan(null);
      setPlanOptions([]);
      setSelectedPlanIndex(0);
      setNavUserLocation(from.label === "Current location" ? { lat: from.lat, lon: from.lon } : null);

      try {
        const data = await apiFetch<{ plan: TripPlan; alternatives?: TripPlan[] }>("/api/trips", {
          method: "POST",
          body: JSON.stringify({
            origin: { lat: from.lat, lon: from.lon, label: from.label },
            destination: { lat: to.lat, lon: to.lon, label: to.label },
            departureSocPct: parseInt(departureSocRef.current, 10),
            reserveSocPct: parseInt(reserveSocRef.current, 10),
            alternatives: 3,
          }),
        });
        if (requestId !== planRequestRef.current) return;
        const options = data.alternatives?.length ? data.alternatives : [data.plan];
        setPlanOptions(options);
        setSelectedPlanIndex(0);
        setPlan(options[0]);
      } catch (e) {
        if (requestId !== planRequestRef.current) return;
        const err = e as { message?: string; code?: string; fields?: Record<string, string> };
        if (err.code === "NO_VIABLE_ROUTE") {
          if (err.fields?.reason === "no_chargers_on_route") {
            setError(
              "No compatible chargers found along this route. Try a shorter trip, a different corridor, or check that your vehicle connector type matches stations in the area."
            );
          } else if (err.fields?.longestLegKm && err.fields?.usableRangeKm) {
            setError(
              `A ${err.fields.longestLegKm} km section exceeds your ~${err.fields.usableRangeKm} km range at ${departureSoc}% charge. Raise your current charge, lower reserve, or choose a closer destination.`
            );
          } else {
            setError(
              "Could not plan this trip with enough charging stops. Try a closer destination, a different start point, or more charge before you leave."
            );
          }
        } else if (err.code === "ROUTING_UNAVAILABLE") {
          setError("Road routing is temporarily unavailable. Please try again in a moment.");
        } else {
          setError(err.message || "Could not plan route");
        }
      } finally {
        if (requestId === planRequestRef.current) setLoading(false);
      }
    },
    []
  );

  const handleDestinationChange = (hit: GeocodeHit | null) => {
    setDestination(hit);
    setPlan(null);
    setPlanOptions([]);
  };

  const handleOriginChange = (hit: GeocodeHit | null) => {
    setOrigin(hit);
    if (hit?.label === "Current location") {
      setNavUserLocation({ lat: hit.lat, lon: hit.lon });
    }
  };

  useEffect(() => {
    if (!destination || !origin || originLocating) return;
    void runPlan(origin, destination);
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon, originLocating, destination, origin, runPlan]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Navigate</h1>
        <p className="text-slate-400">
          {destination
            ? `Route from ${originLabel(origin)} to ${destinationLabel(destination)}`
            : "Where do you want to go?"}
        </p>
      </div>

      <Card className="space-y-5">
        <PlaceSearchField
          id="destination"
          label="Where to?"
          hint="Search your destination"
          placeholder="City, address, or landmark…"
          value={destination}
          onChange={handleDestinationChange}
          onError={setError}
          locationBias={origin ?? navUserLocation}
        />

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
          onChange={handleOriginChange}
          onError={setError}
          showLocateMe
          locationBias={navUserLocation ?? origin}
        />

        {destination && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="departureSoc">Current charge (%)</Label>
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

            <Button
              className="w-full"
              variant="secondary"
              onClick={() => origin && destination && runPlan(origin, destination)}
              disabled={loading || !origin || !destination}
            >
              {loading ? "Updating route…" : "Update route for charge levels"}
            </Button>
          </>
        )}
      </Card>

      {error && (
        <p className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {loading && !plan && destination && (
        <p className="text-center text-slate-400">Planning your route and charge stops…</p>
      )}

      {plan && planOptions.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {planOptions.map((option, index) => {
            const totalMin = option.totalDrivingMin + option.totalChargingMin;
            const isSelected = index === selectedPlanIndex;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedPlanIndex(index);
                  setPlan(option);
                  setSwapStopIndex(null);
                }}
                className={`rounded-xl border px-4 py-2.5 text-left text-sm transition min-h-[44px] ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                }`}
              >
                <span className="font-medium">Route {index + 1}</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {totalMin} min · {option.chargeStops.length} stop
                  {option.chargeStops.length === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {plan && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Your route</h2>
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
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-300">
                Recommended charge stops for your battery level
              </p>
              <ol className="space-y-3">
                {plan.chargeStops.map((stop, i) => (
                  <li key={`${stop.stationId}-${i}`} className="rounded-xl border border-slate-700 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">
                        Stop {i + 1}: {stop.stationName}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0 px-3 py-1.5 text-xs min-h-[36px]"
                        onClick={() => setSwapStopIndex(i)}
                      >
                        Change
                      </Button>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      Arrive {stop.arrivalSocPct}% → Depart {stop.departureSocPct}% ·{" "}
                      {stop.chargingDurationMin} min
                      {stop.maxPowerKw ? ` · ${stop.maxPowerKw} kW` : ""}
                      {stop.connectorStandard ? ` ${stop.connectorStandard}` : ""}
                    </p>
                    {stop.maxPowerKw && stop.availability && stop.detourKm != null && (
                      <p className="mt-2 text-xs text-emerald-300/90">
                        {chargeStopReason(
                          stop.arrivalSocPct,
                          plan.reserveSocPct,
                          stop.maxPowerKw,
                          stop.availability,
                          stop.detourKm
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {plan && swapStopIndex != null && (
        <ChargeStopPicker
          planId={plan.id}
          stopIndex={swapStopIndex}
          stopName={plan.chargeStops[swapStopIndex]?.stationName ?? "Stop"}
          departureSocPct={parseInt(departureSoc, 10)}
          onSelect={(updated) => {
            setPlan(updated);
            setPlanOptions((prev) =>
              prev.map((p, i) => (i === selectedPlanIndex ? updated : p))
            );
          }}
          onClose={() => setSwapStopIndex(null)}
        />
      )}
    </div>
  );
}
