"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Zap } from "lucide-react";
import { Card } from "@/components/ui";
import { StaleDataBanner } from "@/components/stale-data-banner";
import { apiFetch, getAuthToken } from "@/lib/utils";
import { loadCache, mergeHistorySnapshot, type CachedHistorySnapshot } from "@ev/domain";

interface SessionRow {
  id: string;
  stationId: string;
  startTs: string;
  endTs: string;
  energyKwh: number;
  cost: number | null;
  currency: string;
}

interface Summary {
  totalEnergyKwh: number;
  totalCost: number;
  sessionCount: number;
  avgCostPerKwh: number | null;
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }

    const cached = loadCache().historySnapshot;
    if (cached) {
      setSessions(cached.sessions);
      setSummary(cached.summary);
      setFromCache(true);
      setCacheTimestamp(cached.cachedAt);
    }

    apiFetch<{ sessions: SessionRow[]; summary: Summary }>("/api/history")
      .then((data) => {
        const snapshot: CachedHistorySnapshot = {
          sessions: data.sessions,
          summary: data.summary,
        };
        const merged = mergeHistorySnapshot(loadCache(), snapshot, false);
        if (merged) {
          setSessions(merged.sessions);
          setSummary(merged.summary);
          setFromCache(false);
          setCacheTimestamp(null);
        }
      })
      .catch(() => {
        const merged = mergeHistorySnapshot(loadCache(), null, true);
        if (merged) {
          setSessions(merged.sessions);
          setSummary(merged.summary);
          setFromCache(true);
          setCacheTimestamp(merged.cachedAt);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <p className="text-center text-slate-400 py-12">Loading history…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Charging history</h1>
        <p className="text-slate-400">Energy use and costs over time</p>
      </div>

      {fromCache && (
        <StaleDataBanner
          message="History is temporarily unavailable. Showing your last saved summary on this device."
          cachedAt={cacheTimestamp}
        />
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="text-center">
            <p className="text-xs text-slate-400">Total energy</p>
            <p className="text-xl font-bold">{summary.totalEnergyKwh} kWh</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Total cost</p>
            <p className="text-xl font-bold">${summary.totalCost.toFixed(2)}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Sessions</p>
            <p className="text-xl font-bold">{summary.sessionCount}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Avg $/kWh</p>
            <p className="text-xl font-bold">
              {summary.avgCostPerKwh != null ? `$${summary.avgCostPerKwh.toFixed(4)}` : "N/A"}
            </p>
          </Card>
        </div>
      )}

      {sessions.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <History className="h-10 w-10 text-slate-600" />
          <p className="text-slate-400">No charging sessions yet</p>
          <p className="text-sm text-slate-500">Start a session from the charger map to see it here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Card key={s.id} className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400">
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{s.stationId.replace(/_/g, " ")}</p>
                <p className="text-sm text-slate-400">
                  {new Date(s.startTs).toLocaleDateString()} · {s.energyKwh.toFixed(1)} kWh
                </p>
              </div>
              <p className="font-semibold tabular-nums">
                {s.cost != null ? `$${s.cost.toFixed(2)}` : "Pending"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
