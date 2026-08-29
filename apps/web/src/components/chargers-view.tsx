"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ChargingStation } from "@ev/domain";

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
  const [filters, setFilters] = useState({
    radiusKm: 15,
    connectorStandard: "",
    minPowerKw: "",
  });
  const [center, setCenter] = useState({ lat: initialLat, lon: initialLon });
  const [selected, setSelected] = useState<(ChargingStation & { distanceKm: number }) | null>(null);

  const search = async (lat: number, lon: number) => {
    setLoading(true);
    setError(null);
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
      setStations(data.stations);
      setFallbackUsed(data.fallbackUsed);
      setCenter({ lat, lon });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => search(pos.coords.latitude, pos.coords.longitude),
        () => search(initialLat, initialLon)
      );
    } else {
      search(initialLat, initialLon);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Find Chargers</h1>
        <p className="text-slate-400">Stations near you that match your vehicle</p>
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
      </div>

      {fallbackUsed && (
        <p className="rounded-xl bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
          No chargers found within your radius. Showing nearest stations outside the search area.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <MapView
        center={center}
        stations={stations}
        selected={selected}
        onSelect={setSelected}
      />

      {loading ? (
        <p className="text-center text-slate-400">Searching for chargers…</p>
      ) : (
        <div className="space-y-3">
          {stations.map((station) => (
            <button
              key={station.id}
              onClick={() => setSelected(station)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left transition hover:border-emerald-600/50 min-h-[44px]"
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
          ))}
        </div>
      )}

      {selected && (
        <StationDetail
          station={selected}
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
  onClose,
  onFavorite,
  onStartCharge,
}: {
  station: ChargingStation & { distanceKm: number };
  onClose: () => void;
  onFavorite: () => void;
  onStartCharge: (connectorId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-6 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{station.operatorName}</h2>
            <p className="text-slate-400">{station.distanceKm.toFixed(1)} km away</p>
          </div>
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-slate-400 hover:bg-slate-800 min-h-[44px] min-w-[44px]">
            ✕
          </button>
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
