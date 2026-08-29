"use client";

import { RefreshCw } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import type { VehicleState } from "@ev/domain";

const QUICK_SOC_LEVELS = [50, 80, 100] as const;

export function HomeBatteryCard({
  state,
  rangeDisplay,
  unit,
  reserveSocPct,
  showStaleBadge,
  ageDisplay,
  refreshing,
  updatingSoc,
  onRefresh,
  onSetSoc,
}: {
  state: (VehicleState & { stale?: boolean; fromCache?: boolean }) | null;
  rangeDisplay: number | null;
  unit: string;
  reserveSocPct: number;
  showStaleBadge: boolean;
  ageDisplay: string | null;
  refreshing: boolean;
  updatingSoc: boolean;
  onRefresh: () => void;
  onSetSoc: (pct: number) => void;
}) {
  const soc = state?.socPct ?? 0;
  const chargeArc = (soc / 100) * 264;
  const reserveArc = (reserveSocPct / 100) * 264;

  return (
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
              stroke="#78350f"
              strokeWidth="8"
              strokeDasharray={`${reserveArc} 264`}
              strokeLinecap="round"
              opacity={0.55}
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="#10b981"
              strokeWidth="8"
              strokeDasharray={`${chargeArc} 264`}
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
              {state?.pluggedIn
                ? "Plugged in"
                : state?.pluggedIn === false
                  ? "Not plugged in"
                  : "Unknown"}
            </Badge>
            {showStaleBadge && ageDisplay && <Badge variant="warning">{ageDisplay}</Badge>}
            {!showStaleBadge && ageDisplay && (
              <span className="text-xs text-slate-500">{ageDisplay}</span>
            )}
          </div>
          <p className="text-xs text-amber-200/80">Amber ring = your {reserveSocPct}% reserve buffer</p>
        </div>
      </div>

      <div className="relative mt-4 space-y-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Quick update
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_SOC_LEVELS.map((level) => (
              <Button
                key={level}
                variant={state?.socPct === level ? "default" : "outline"}
                size="sm"
                disabled={updatingSoc}
                onClick={() => onSetSoc(level)}
              >
                {level}%
              </Button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh vehicle state"
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Sync from vehicle
        </Button>
      </div>
    </Card>
  );
}
