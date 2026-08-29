"use client";

import { useEffect, useState } from "react";
import type { ChargingStation } from "@ev/domain";
import { Button } from "@/components/ui";
import { apiFetch } from "@/lib/utils";

type Alternative = {
  station: ChargingStation;
  distanceKm: number;
  score: number;
  maxPowerKw: number;
};

interface ChargeStopPickerProps {
  planId: string;
  stopIndex: number;
  stopName: string;
  departureSocPct: number;
  onSelect: (plan: import("@ev/domain").TripPlan) => void;
  onClose: () => void;
}

export function ChargeStopPicker({
  planId,
  stopIndex,
  stopName,
  departureSocPct,
  onSelect,
  onClose,
}: ChargeStopPickerProps) {
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [currentStationId, setCurrentStationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{
          alternatives: Alternative[];
          currentStationId: string;
        }>(
          `/api/trips/${planId}/stops/${stopIndex}/alternatives?departureSocPct=${departureSocPct}`
        );
        if (cancelled) return;
        setAlternatives(data.alternatives);
        setCurrentStationId(data.currentStationId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load alternatives");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, stopIndex, departureSocPct]);

  const pickStation = async (stationId: string) => {
    if (stationId === currentStationId) {
      onClose();
      return;
    }
    setSwapping(stationId);
    setError(null);
    try {
      const data = await apiFetch<{ plan: import("@ev/domain").TripPlan }>(
        `/api/trips/${planId}/stops/${stopIndex}`,
        {
          method: "PUT",
          body: JSON.stringify({ stationId, departureSocPct }),
        }
      );
      onSelect(data.plan);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not swap this stop");
    } finally {
      setSwapping(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end bg-black/60 sm:items-center sm:justify-center">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-6 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Change charge stop</h2>
            <p className="text-sm text-slate-400">
              Replace stop {stopIndex + 1}: {stopName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-slate-400 hover:bg-slate-800 min-h-[44px] min-w-[44px]"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-center text-slate-400">Finding nearby alternatives…</p>
        ) : alternatives.length === 0 ? (
          <p className="text-center text-slate-400">No other compatible stations found near this leg.</p>
        ) : (
          <ol className="space-y-2">
            {alternatives.map((alt) => {
              const isCurrent = alt.station.id === currentStationId;
              return (
                <li key={alt.station.id}>
                  <button
                    type="button"
                    disabled={Boolean(swapping)}
                    onClick={() => pickStation(alt.station.id)}
                    className={`w-full rounded-xl border p-3 text-left transition min-h-[44px] ${
                      isCurrent
                        ? "border-emerald-600/60 bg-emerald-950/30"
                        : "border-slate-700 hover:border-emerald-600/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{alt.station.operatorName}</p>
                        <p className="text-sm text-slate-400">
                          {alt.distanceKm.toFixed(1)} km off route · up to {alt.maxPowerKw} kW
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">
                          Current
                        </span>
                      )}
                      {swapping === alt.station.id && (
                        <span className="text-xs text-slate-400">Updating…</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
