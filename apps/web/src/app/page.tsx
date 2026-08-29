"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, MapPin, Route, RefreshCw } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import { apiFetch, getAuthToken, setAuthToken } from "@/lib/utils";
import { formatAgeMinutes, convertDistance } from "@ev/domain";

interface HomeData {
  account: { distanceUnit: "km" | "mi"; email: string };
  activeVehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    batteryKwh: number;
    connectorStandards: string[];
  } | null;
}

interface VehicleState {
  socPct: number | null;
  rangeKm: number | null;
  pluggedIn: boolean | null;
  chargingStatus: string | null;
  capturedAt: string | null;
}

interface ActiveSession {
  id: string;
  energyKwh: number;
  instantaneousPowerKw: number;
  elapsedSeconds: number;
  cost: number | null;
  currency: string;
}

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [state, setState] = useState<VehicleState | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [manualSoc, setManualSoc] = useState("");
  const [showManual, setShowManual] = useState(false);

  const load = async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    try {
      const me = await apiFetch<HomeData>("/api/me");
      setData(me);
      if (me.activeVehicle) {
        const vs = await apiFetch<{ state: VehicleState }>(`/api/vehicles/${me.activeVehicle.id}`);
        setState(vs.state);
      }
      const cs = await apiFetch<{ session: ActiveSession | null }>("/api/charging-sessions");
      setSession(cs.session);
    } catch {
      router.replace("/auth");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(async () => {
      try {
        const cs = await apiFetch<{ session: ActiveSession | null }>("/api/charging-sessions");
        setSession(cs.session);
      } catch {
        /* ignore */
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const refreshState = async () => {
    if (!data?.activeVehicle || refreshing) return;
    setRefreshing(true);
    try {
      const vs = await apiFetch<{ state: VehicleState }>(`/api/vehicles/${data.activeVehicle.id}`);
      setState(vs.state);
    } finally {
      setRefreshing(false);
    }
  };

  const updateManualSoc = async () => {
    if (!data?.activeVehicle) return;
    const soc = parseInt(manualSoc);
    await apiFetch(`/api/vehicles/${data.activeVehicle.id}`, {
      method: "PUT",
      body: JSON.stringify({ socPct: soc }),
    });
    setShowManual(false);
    await load();
  };

  const stopSession = async () => {
    if (!session) return;
    await apiFetch(`/api/charging-sessions/${session.id}`, { method: "POST" });
    setSession(null);
  };

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        Loading your vehicle…
      </div>
    );
  }

  if (!data.activeVehicle) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <Zap className="h-12 w-12 text-emerald-500" />
        <h1 className="text-2xl font-bold">Add your vehicle</h1>
        <p className="max-w-sm text-slate-400">
          Set up your EV profile so range estimates and charger filters match your car.
        </p>
        <Link href="/auth?setup=1">
          <Button>Add vehicle</Button>
        </Link>
      </div>
    );
  }

  const age = formatAgeMinutes(state?.capturedAt ?? null);
  const unit = data.account.distanceUnit;
  const rangeDisplay =
    state?.rangeKm != null ? convertDistance(state.rangeKm, unit) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-400">{data.activeVehicle.year} {data.activeVehicle.make}</p>
        <h1 className="text-2xl font-bold">{data.activeVehicle.model}</h1>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 to-transparent" />
        <div className="relative flex items-center gap-6">
          <div
            className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-emerald-500/30 bg-slate-950"
            role="img"
            aria-label={`Battery charge ${state?.socPct ?? "unavailable"} percent`}
          >
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#10b981"
                strokeWidth="8"
                strokeDasharray={`${((state?.socPct ?? 0) / 100) * 264} 264`}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-3xl font-bold tabular-nums">
              {state?.socPct ?? "—"}
              {state?.socPct != null && <span className="text-lg">%</span>}
            </span>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm text-slate-400">Estimated range</p>
              <p className="text-2xl font-semibold tabular-nums">
                {rangeDisplay != null ? `${rangeDisplay} ${unit}` : "Unavailable"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={state?.pluggedIn ? "success" : "default"}>
                {state?.pluggedIn ? "Plugged in" : state?.pluggedIn === false ? "Not plugged in" : "Unknown"}
              </Badge>
              {age.isStale && state?.capturedAt && (
                <Badge variant="warning">{age.display}</Badge>
              )}
              {!age.isStale && state?.capturedAt && (
                <span className="text-xs text-slate-500">{age.display}</span>
              )}
            </div>
          </div>
        </div>
        <div className="relative mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshState}
            disabled={refreshing}
            aria-label="Refresh vehicle state"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowManual(!showManual)}>
            Update charge level
          </Button>
        </div>
        {showManual && (
          <div className="relative mt-3 flex gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={manualSoc}
              onChange={(e) => setManualSoc(e.target.value)}
              placeholder="0–100"
              className="h-11 flex-1 rounded-xl border border-slate-600 bg-slate-950 px-3"
              aria-label="State of charge percentage"
            />
            <Button size="sm" onClick={updateManualSoc}>Save</Button>
          </div>
        )}
      </Card>

      {session && (
        <Card className="border-emerald-700/50 charging-pulse">
          <div className="flex items-center gap-2 text-emerald-400">
            <Zap className="h-5 w-5" />
            <span className="font-semibold">Charging in progress</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-400">Energy</p>
              <p className="font-semibold">{session.energyKwh.toFixed(1)} kWh</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Power</p>
              <p className="font-semibold">{session.instantaneousPowerKw.toFixed(0)} kW</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Cost</p>
              <p className="font-semibold">
                {session.cost != null ? `$${session.cost.toFixed(2)}` : "Pending"}
              </p>
            </div>
          </div>
          <Button variant="destructive" className="mt-4 w-full" onClick={stopSession}>
            Stop charging
          </Button>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/chargers" className="block">
          <Card className="flex items-center gap-4 transition hover:border-emerald-600/40 min-h-[72px]">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Find chargers</p>
              <p className="text-sm text-slate-400">Near you, filtered for your car</p>
            </div>
          </Card>
        </Link>
        <Link href="/trips" className="block">
          <Card className="flex items-center gap-4 transition hover:border-emerald-600/40 min-h-[72px]">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
              <Route className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Plan a trip</p>
              <p className="text-sm text-slate-400">Route with charge stops included</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
