"use client";

import { useEffect, useState } from "react";
import { Clock, Route } from "lucide-react";
import { Card } from "@/components/ui";
import { apiFetch } from "@/lib/utils";

export type SavedTripSummary = {
  id: string;
  createdAt: string;
  originLabel: string;
  destinationLabel: string;
  totalDistanceKm: number;
  chargeStopCount: number;
  totalMin: number;
};

function formatTripDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function shortLabel(label: string): string {
  return label.split(",").slice(0, 2).join(",").trim();
}

export function SavedTripsList({ onSelect }: { onSelect: (tripId: string) => void }) {
  const [trips, setTrips] = useState<SavedTripSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ trips: SavedTripSummary[] }>("/api/trips");
        if (!cancelled) setTrips(data.trips ?? []);
      } catch {
        if (!cancelled) setTrips([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading recent trips…</p>;
  }

  if (trips.length === 0) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-emerald-400" />
        <h2 className="text-lg font-semibold">Saved trips</h2>
      </div>
      <p className="text-sm text-slate-400">Reopen a recent route without replanning from scratch.</p>
      <ul className="space-y-2">
        {trips.map((trip) => (
          <li key={trip.id}>
            <button
              type="button"
              onClick={() => onSelect(trip.id)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-left transition hover:border-emerald-600/50 min-h-[44px]"
            >
              <p className="font-medium">
                {shortLabel(trip.originLabel)} → {shortLabel(trip.destinationLabel)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>{trip.totalDistanceKm} km</span>
                <span>{trip.totalMin} min total</span>
                <span>
                  {trip.chargeStopCount} stop{trip.chargeStopCount === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTripDate(trip.createdAt)}
                </span>
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
