"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Zap } from "lucide-react";
import { Card } from "@/components/ui";
import { apiFetch, getAuthToken } from "@/lib/utils";

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

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    apiFetch<{ sessions: SessionRow[]; summary: Summary }>("/api/history")
      .then((data) => {
        setSessions(data.sessions);
        setSummary(data.summary);
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
          <p className="text-sm text-slate-500">Start a charge from the Chargers tab to see history here</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Card key={s.id} className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/40">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{s.stationId}</p>
                <p className="text-sm text-slate-400">
                  {new Date(s.startTs).toLocaleDateString()} · {s.energyKwh?.toFixed(1) ?? 0} kWh
                </p>
              </div>
              <p className="font-semibold tabular-nums">
                {s.cost != null ? `$${s.cost.toFixed(2)}` : "—"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
