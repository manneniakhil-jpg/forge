"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ChargingStation } from "@ev/domain";
import { DirectionsButton } from "@/components/directions-button";
import {
  cacheChargerResults,
  cacheFavorites,
  getCachedChargerResults,
  loadCache,
} from "@ev/domain";
import { StaleDataBanner } from "@/components/stale-data-banner";
import { LocateMeButton } from "@/components/locate-me-button";
import { getReachabilityCache, stationsWithDistance } from "@/lib/reachability-client";
import { getCurrentLocation } from "@/lib/geolocation";

const MapView = dynamic(() => import("./charger-map").then((m) => m.ChargerMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-2xl bg-slate-900 text-slate-400">
      Loading map…
    </div>
  ),
});

interface ChargersViewProps {
  initialLat?: number;
  initialLon?: number;
}

export function ChargersView({ initialLat = 37.7749, initialLon = -122.4194 }: ChargersViewProps) {
  const [stations, setStations] = useState<Array<ChargingStation & { distanceKm: number; outsideRadius?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [regionalDemoAdded, setRegionalDemoAdded] = useState(false);
  const [dataSource, setDataSource] = useState<"google_places" | "local_seed" | null>(null);
  const [filters, setFilters] = useState({
    radiusKm: 15,
    connectorStandard: "",
    minPowerKw: "",
  });
  const [center, setCenter] = useState({ lat: initialLat, lon: initialLon });
  const [selected, setSelected] = useState<(ChargingStation & { distanceKm: number }) | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);
  const [directoryUnavailable, setDirectoryUnavailable] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapZoom, setMapZoom] = useState(12);

  const applyCachedResults = (lat: number, lon: number) => {
    const cached = getCachedChargerResults(getReachabilityCache());
    if (!cached) return false;
    const searchCenter = { lat, lon };
    setStations(stationsWithDistance(cached.stations, searchCenter));
    setCenter(searchCenter);
    setFromCache(true);
    setCacheTimestamp(cached.cachedAt);
    setDirectoryUnavailable(false);
    setFallbackUsed(false);
    return true;
  };

  const search = async (lat: number, lon: number) => {
    setLoading(true);
    setError(null);
    setFromCache(false);
    setCacheTimestamp(null);
    setDirectoryUnavailable(false);
    setRegionalDemoAdded(false);
    setDataSource(null);
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        radiusKm: String(filters.radiusKm),
      });
      if (filters.connectorStandard) params.set("connectorStandard", filters.connectorStandard);
      if (filters.minPowerKw) params.set("minPowerKw", filters.minPowerKw);

      const data = await fetch(`/api/chargers?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("ev_session_token")}` },
      }).then((r) => r.json());

      if (data.code) throw new Error(data.message);

      const cache = loadCache();
      cacheChargerResults(cache, data.stations, { lat, lon });
      if (Array.isArray(data.favorites)) {
        cacheFavorites(cache, data.favorites);
      }

      setStations(data.stations);
      setFallbackUsed(data.fallbackUsed);
      setRegionalDemoAdded(Boolean(data.regionalDemoAdded));
      setDataSource(data.dataSource ?? "local_seed");
      setCenter({ lat, lon });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Search failed";
      const hadCache = applyCachedResults(lat, lon);
      if (hadCache) {
        setError(null);
      } else {
        setStations([]);
        setDirectoryUnavailable(true);
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setUserLocation(point);
          setCenter(point);
          setMapZoom(14);
          search(point.lat, point.lon);
        },
        () => search(initialLat, initialLon)
      );
    } else {
      search(initialLat, initialLon);
    }
  }, []);

  const locateMe = async () => {
    setLocating(true);
    setError(null);
    setSelected(null);
    try {
      const point = await getCurrentLocation();
      setUserLocation(point);
      setCenter(point);
      setMapZoom(14);
      await search(point.lat, point.lon);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get your location");
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Find Chargers</h1>
        <p className="text-slate-400">
          Stations near you that match your vehicle
          {dataSource === "google_places" && (
            <span className="text-slate-500"> · via Google Maps</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="h-11 rounded-xl border border-slate-600 bg-slate-900 px-3 text-sm"
          value={filters.radiusKm}
          onChange={(e) => setFilters({ ...filters, radiusKm: Number(e.target.value) })}
          aria-label="Search radius"
        >
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={15}>15 km</option>
          <option value={25}>25 km</option>
          <option value={50}>50 km</option>
        </select>
        <select
          className="h-11 rounded-xl border border-slate-600 bg-slate-900 px-3 text-sm"
          value={filters.connectorStandard}
          onChange={(e) => setFilters({ ...filters, connectorStandard: e.target.value })}
          aria-label="Connector type filter"
        >
          <option value="">All connectors</option>
          <option value="CCS">CCS</option>
          <option value="NACS">NACS</option>
          <option value="CHAdeMO">CHAdeMO</option>
          <option value="Type2">Type 2</option>
        </select>
        <button
          onClick={() => search(center.lat, center.lon)}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium hover:bg-emerald-700 min-h-[44px]"
        >
          Search
        </button>
        <LocateMeButton onClick={locateMe} loading={locating} />
      </div>

      {regionalDemoAdded && (
        <p className="rounded-xl bg-emerald-900/30 px-4 py-3 text-sm text-emerald-100">
          Added demo chargers near your location — our full network data covers California corridors.
        </p>
      )}

      {fallbackUsed && stations.length > 0 && (
        <p className="rounded-xl bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
          No chargers within {filters.radiusKm} km. Showing the {stations.length} nearest station
          {stations.length === 1 ? "" : "s"} (up to 250 km away).
        </p>
      )}

      {fallbackUsed && stations.length === 0 && (
        <p className="rounded-xl bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
          No chargers found near this location. Try increasing the search radius.
        </p>
      )}

      {fromCache && (
        <StaleDataBanner
          message="Charger directory is unavailable. Showing stations from your last successful search."
          cachedAt={cacheTimestamp}
        />
      )}

      {directoryUnavailable && !fromCache && (
        <StaleDataBanner message="Charger directory is unavailable and no recent stations are cached on this device." />
      )}

      {error && !fromCache && !directoryUnavailable && (
        <p className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <MapView
        center={center}
        userLocation={userLocation}
        mapZoom={mapZoom}
        stations={stations}
        selected={selected}
        onSelect={setSelected}
        onLocateMe={locateMe}
        locating={locating}
      />

      {loading ? (
        <p className="text-center text-slate-400">Searching for chargers…</p>
      ) : (
        <div className="space-y-3">
          {stations.map((station) => (
            <div
              key={station.id}
              className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 transition hover:border-emerald-600/50"
            >
              <button
                type="button"
                onClick={() => setSelected(station)}
                className="min-w-0 flex-1 text-left min-h-[44px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{station.operatorName}</p>
                    <p className="text-sm text-slate-400">
                      {station.distanceKm.toFixed(1)} km · {station.networkId.replace(/_/g, " ")}
                    </p>
                  </div>
                  {station.outsideRadius && (
                    <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs text-amber-300">
                      Outside radius
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {station.connectors.map((c) => (
                    <span
                      key={c.id}
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        c.availability === "Available"
                          ? "bg-emerald-900/50 text-emerald-300"
                          : c.availability === "Occupied"
                            ? "bg-amber-900/50 text-amber-300"
                            : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {c.standard} {c.maxPowerKw}kW
                    </span>
                  ))}
                </div>
              </button>
              <DirectionsButton
                destination={{ lat: station.latitude, lon: station.longitude }}
                userLocation={userLocation}
                variant="compact"
                className="shrink-0 self-center"
              />
            </div>
          ))}
        </div>
      )}

      {selected && (
        <StationDetail
          station={selected}
          userLocation={userLocation}
          onClose={() => setSelected(null)}
          onFavorite={async () => {
            await fetch(`/api/favorites/${selected.id}`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${localStorage.getItem("ev_session_token")}` },
            });
          }}
          onStartCharge={async (connectorId: string) => {
            const res = await fetch("/api/charging-sessions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("ev_session_token")}`,
              },
              body: JSON.stringify({ stationId: selected.id, connectorId }),
            }).then((r) => r.json());
            if (res.sessionId) {
              window.location.href = "/?charging=1";
            } else {
              alert(res.message || "Could not start session");
            }
          }}
        />
      )}
    </div>
  );
}

function StationDetail({
  station,
  userLocation,
  onClose,
  onFavorite,
  onStartCharge,
}: {
  station: ChargingStation & { distanceKm: number };
  userLocation: { lat: number; lon: number } | null;
  onClose: () => void;
  onFavorite: () => void;
  onStartCharge: (connectorId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-6 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{station.operatorName}</h2>
            <p className="text-slate-400">{station.distanceKm.toFixed(1)} km away</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DirectionsButton
              destination={{ lat: station.latitude, lon: station.longitude }}
              userLocation={userLocation}
              variant="compact"
            />
            <button
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-slate-400 hover:bg-slate-800 min-h-[44px] min-w-[44px]"
            >
              ✕
            </button>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate-300">{station.accessRules}</p>
        <div className="space-y-3">
          {station.connectors.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-700 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.standard} · {c.maxPowerKw} kW</span>
                <span className="text-sm text-slate-400">{c.availability}</span>
              </div>
              <p className="text-sm text-slate-400">
                {c.pricePerKwh === "Unknown" ? "Price unknown" : `$${c.pricePerKwh}/kWh`}
              </p>
              {c.availability === "Available" && station.remoteStartSupported && (
                <button
                  onClick={() => onStartCharge(c.id)}
                  className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium hover:bg-emerald-700 min-h-[44px]"
                >
                  Start charging
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onFavorite}
          className="mt-4 w-full rounded-xl border border-slate-600 py-2.5 text-sm hover:bg-slate-800 min-h-[44px]"
        >
          Add to favorites
        </button>
      </div>
    </div>
  );
}
