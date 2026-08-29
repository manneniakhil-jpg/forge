"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import { StaleDataBanner } from "@/components/stale-data-banner";
import { HomeBatteryCard } from "@/components/home-battery-card";
import { HomeClosestCharger } from "@/components/home-closest-charger";
import { HomeDashboard } from "@/components/home-dashboard";
import { apiFetch, getAuthToken } from "@/lib/utils";
import { getCurrentLocation } from "@/lib/geolocation";
import { loadRecentDestination, type SavedPlace } from "@/lib/home-storage";
import {
  formatNearbyCharger,
  pickFavoriteStations,
  reachCheckToPlace,
  weeklySummary,
  type FavoriteStationGlance,
  type NearbyFastCharger,
  type ReachCheck,
} from "@/lib/home-insights";
import {
  formatAgeMinutes,
  convertDistance,
  loadCache,
  mergeVehicleState,
  mergeActiveSession,
  type CachedActiveSession,
  type ConnectorStandard,
  type VehicleState,
} from "@ev/domain";

interface HomeData {
  account: { distanceUnit: "km" | "mi"; email: string; reserveSoc: number };
  activeVehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    batteryKwh: number;
    connectorStandards: ConnectorStandard[];
    efficiencyWhKm: number;
  } | null;
}

type ChargerStation = {
  id: string;
  operatorName: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  connectors: Array<{
    maxPowerKw: number;
    availability: string;
    standard: ConnectorStandard;
  }>;
};

type DisplayVehicleState = VehicleState & {
  stale?: boolean;
  fromCache?: boolean;
};

type DisplaySession = CachedActiveSession & {
  stale?: boolean;
  fromCache?: boolean;
};

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [state, setState] = useState<DisplayVehicleState | null>(null);
  const [session, setSession] = useState<DisplaySession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingSoc, setUpdatingSoc] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [sessionStale, setSessionStale] = useState(false);
  const [weekly, setWeekly] = useState({
    sessionCount: 0,
    energyKwh: 0,
    cost: 0,
    avgCostPerKwh: null as number | null,
  });
  const [nearbyFast, setNearbyFast] = useState<NearbyFastCharger | null>(null);
  const [favorites, setFavorites] = useState<FavoriteStationGlance[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [recentDestination, setRecentDestination] = useState<SavedPlace | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [reachCheck, setReachCheck] = useState<ReachCheck | null>(null);

  const loadVehicleState = (vehicleId: string, failed: boolean, incoming: VehicleState | null) => {
    const cache = loadCache();
    const merged = mergeVehicleState(cache, vehicleId, incoming, failed);
    setState(merged);
    return merged;
  };

  const loadActiveSession = (failed: boolean, incoming: CachedActiveSession | null) => {
    const cache = loadCache();
    const merged = mergeActiveSession(cache, incoming, failed);
    setSession(merged);
    setSessionStale(Boolean(merged?.fromCache && failed));
    return merged;
  };

  const loadChargingContext = async (
    vehicle: NonNullable<HomeData["activeVehicle"]>,
    distanceUnit: "km" | "mi",
    socPct: number | null | undefined,
    reserveSocPct: number
  ) => {
    setNearbyLoading(true);
    try {
      const point = await getCurrentLocation();
      setUserLocation(point);
      const recent = loadRecentDestination();
      if (recent && socPct != null) {
        setReachCheck(
          reachCheckToPlace(
            point,
            recent,
            socPct,
            vehicle.batteryKwh,
            vehicle.efficiencyWhKm,
            reserveSocPct,
            distanceUnit
          )
        );
      } else {
        setReachCheck(null);
      }

      const chargers = await apiFetch<{
        stations: ChargerStation[];
        favorites: string[];
      }>(`/api/chargers?lat=${point.lat}&lon=${point.lon}&radiusKm=30`);

      const fast = chargers.stations
        .map((s) => formatNearbyCharger(s, vehicle.connectorStandards, distanceUnit))
        .filter((s): s is NearbyFastCharger => s !== null && s.maxPowerKw >= 100)
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];

      setNearbyFast(fast ?? null);
      setFavorites(
        pickFavoriteStations(
          chargers.stations,
          chargers.favorites ?? [],
          vehicle.connectorStandards,
          distanceUnit
        )
      );
    } catch {
      setNearbyFast(null);
      setFavorites([]);
    } finally {
      setNearbyLoading(false);
    }
  };

  const load = async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setRecentDestination(loadRecentDestination());
    try {
      const me = await apiFetch<HomeData>("/api/me");
      setData(me);

      let latestSoc: number | null | undefined = null;

      const vehicleTask = me.activeVehicle
        ? (async () => {
            const cached = loadCache().vehicleStates[me.activeVehicle!.id];
            if (cached) {
              const { cachedAt: _, ...cachedState } = cached;
              latestSoc = cachedState.socPct;
              setState({ ...cachedState, stale: true, fromCache: true });
            }
            try {
              const vs = await apiFetch<{ state: VehicleState }>(
                `/api/vehicles/${me.activeVehicle!.id}`
              );
              latestSoc = vs.state.socPct;
              loadVehicleState(me.activeVehicle!.id, false, vs.state);
              setRefreshFailed(false);
            } catch {
              loadVehicleState(me.activeVehicle!.id, true, null);
            }
          })()
        : Promise.resolve();

      const sessionTask = (async () => {
        try {
          const cs = await apiFetch<{
            session: (CachedActiveSession & { lastRefreshAt?: string }) | null;
          }>("/api/charging-sessions");
          const incoming = cs.session
            ? {
                id: cs.session.id,
                energyKwh: cs.session.energyKwh,
                instantaneousPowerKw: cs.session.instantaneousPowerKw,
                elapsedSeconds: cs.session.elapsedSeconds,
                cost: cs.session.cost,
                currency: cs.session.currency,
                lastRefreshAt: cs.session.lastRefreshAt ?? new Date().toISOString(),
              }
            : null;
          loadActiveSession(false, incoming);
        } catch {
          loadActiveSession(true, null);
        }
      })();

      const historyTask = (async () => {
        try {
          const history = await apiFetch<{
            sessions: Array<{ startTs: string; energyKwh: number; cost: number | null }>;
          }>("/api/history");
          setWeekly(weeklySummary(history.sessions));
        } catch {
          setWeekly({ sessionCount: 0, energyKwh: 0, cost: 0, avgCostPerKwh: null });
        }
      })();

      await Promise.all([vehicleTask, sessionTask, historyTask]);

      if (me.activeVehicle) {
        await loadChargingContext(
          me.activeVehicle,
          me.account.distanceUnit,
          latestSoc,
          me.account.reserveSoc ?? 10
        );
      }
    } catch {
      router.replace("/auth");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(async () => {
      try {
        const cs = await apiFetch<{
          session: (CachedActiveSession & { lastRefreshAt?: string }) | null;
        }>("/api/charging-sessions");
        const incoming = cs.session
          ? {
              id: cs.session.id,
              energyKwh: cs.session.energyKwh,
              instantaneousPowerKw: cs.session.instantaneousPowerKw,
              elapsedSeconds: cs.session.elapsedSeconds,
              cost: cs.session.cost,
              currency: cs.session.currency,
              lastRefreshAt: cs.session.lastRefreshAt ?? new Date().toISOString(),
            }
          : null;
        loadActiveSession(false, incoming);
      } catch {
        loadActiveSession(true, null);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const refreshState = async () => {
    if (!data?.activeVehicle || refreshing) return;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const vs = await apiFetch<{ state: VehicleState }>(
        `/api/vehicles/${data.activeVehicle.id}`
      );
      loadVehicleState(data.activeVehicle.id, false, vs.state);
    } catch {
      loadVehicleState(data.activeVehicle.id, true, null);
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  const setSoc = async (socPct: number) => {
    if (!data?.activeVehicle || updatingSoc) return;
    setUpdatingSoc(true);
    try {
      await apiFetch(`/api/vehicles/${data.activeVehicle.id}`, {
        method: "PUT",
        body: JSON.stringify({ socPct }),
      });
      setRefreshFailed(false);
      const vs = await apiFetch<{ state: VehicleState }>(
        `/api/vehicles/${data.activeVehicle.id}`
      );
      loadVehicleState(data.activeVehicle.id, false, vs.state);
    } finally {
      setUpdatingSoc(false);
    }
  };

  const stopSession = async () => {
    if (!session) return;
    await apiFetch(`/api/charging-sessions/${session.id}`, { method: "POST" });
    loadActiveSession(false, null);
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
          Set up your car or e-bike so range estimates and charger filters match what you ride.
        </p>
        <Link href="/auth?setup=1">
          <Button>Add vehicle</Button>
        </Link>
      </div>
    );
  }

  const age = formatAgeMinutes(state?.capturedAt ?? null);
  const showStaleBadge = Boolean(state?.fromCache || age.isStale);
  const unit = data.account.distanceUnit;
  const rangeDisplay = state?.rangeKm != null ? convertDistance(state.rangeKm, unit) : null;
  const sessionAge = session?.lastRefreshAt ? formatAgeMinutes(session.lastRefreshAt) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-400">
          {data.activeVehicle.year} {data.activeVehicle.make}
        </p>
        <h1 className="text-2xl font-bold">{data.activeVehicle.model}</h1>
      </div>

      {refreshFailed && state?.fromCache && (
        <StaleDataBanner
          message="Couldn't refresh vehicle data. Showing your last saved reading."
          cachedAt={state.capturedAt}
        />
      )}

      {state?.fromCache && !refreshFailed && !state.capturedAt && (
        <StaleDataBanner message="Vehicle data is unavailable right now." />
      )}

      <HomeBatteryCard
        state={state}
        rangeDisplay={rangeDisplay}
        unit={unit}
        reserveSocPct={data.account.reserveSoc ?? 10}
        showStaleBadge={showStaleBadge}
        ageDisplay={state?.capturedAt ? age.display : null}
        refreshing={refreshing}
        updatingSoc={updatingSoc}
        onRefresh={refreshState}
        onSetSoc={setSoc}
      />

      <HomeClosestCharger
        nearbyFast={nearbyFast}
        nearbyLoading={nearbyLoading}
        userLocation={userLocation}
      />

      {session && (
        <Card className="border-emerald-700/50 charging-pulse">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <Zap className="h-5 w-5" />
              <span className="font-semibold">Charging in progress</span>
            </div>
            {sessionStale && sessionAge && <Badge variant="warning">{sessionAge.display}</Badge>}
          </div>
          {sessionStale && (
            <p className="mt-2 text-xs text-amber-200">
              Session details may be outdated — showing last known values.
            </p>
          )}
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

      <HomeDashboard
        socPct={state?.socPct}
        batteryKwh={data.activeVehicle.batteryKwh}
        efficiencyWhKm={data.activeVehicle.efficiencyWhKm}
        reserveSocPct={data.account.reserveSoc ?? 10}
        distanceUnit={unit}
        connectorStandards={data.activeVehicle.connectorStandards}
        weekly={weekly}
        nearbyFast={nearbyFast}
        favorites={favorites}
        reachCheck={reachCheck}
        userLocation={userLocation}
        isCharging={Boolean(session)}
      />
    </div>
  );
}
