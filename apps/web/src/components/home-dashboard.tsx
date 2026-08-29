"use client";

import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  Lightbulb,
  MapPin,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import {
  formatNearbyCharger,
  rangeInsight,
  tipForToday,
  type NearbyFastCharger,
} from "@/lib/home-insights";
import { convertDistance, type ConnectorStandard } from "@ev/domain";

type WeeklyStats = {
  sessionCount: number;
  energyKwh: number;
  cost: number;
};

export function HomeDashboard({
  socPct,
  batteryKwh,
  efficiencyWhKm,
  reserveSocPct,
  distanceUnit,
  connectorStandards,
  weekly,
  nearbyFast,
  nearbyLoading,
}: {
  socPct: number | null | undefined;
  batteryKwh: number;
  efficiencyWhKm: number;
  reserveSocPct: number;
  distanceUnit: "km" | "mi";
  connectorStandards: ConnectorStandard[];
  weekly: WeeklyStats;
  nearbyFast: NearbyFastCharger | null;
  nearbyLoading: boolean;
}) {
  const insight = rangeInsight(
    socPct,
    batteryKwh,
    efficiencyWhKm,
    reserveSocPct,
    distanceUnit
  );
  const tip = tipForToday();

  const insightBorder =
    insight.tone === "warn"
      ? "border-amber-700/40"
      : insight.tone === "good"
        ? "border-emerald-700/40"
        : "border-slate-700";

  return (
    <div className="space-y-4">
      <section aria-labelledby="home-insights-heading">
        <h2 id="home-insights-heading" className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
          For you today
        </h2>

        <Card className={`space-y-2 border ${insightBorder}`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-400">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{insight.headline}</p>
              <p className="mt-1 text-sm text-slate-400">{insight.detail}</p>
              {insight.tone === "good" && socPct != null && socPct > 40 && (
                <Link
                  href="/trips"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Plan this trip
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              {insight.tone === "warn" && (
                <Link
                  href="/chargers"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-300 hover:text-amber-200"
                >
                  Find a charger nearby
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="home-nearby-heading">
        <h2 id="home-nearby-heading" className="sr-only">
          Nearby charging
        </h2>
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Fast charge nearby</p>
              {nearbyLoading ? (
                <p className="mt-1 text-sm text-slate-400">Checking compatible stations…</p>
              ) : nearbyFast ? (
                <>
                  <p className="mt-1 text-sm text-slate-300">
                    {nearbyFast.name} ·{" "}
                    {convertDistance(nearbyFast.distanceKm, nearbyFast.distanceUnit).toFixed(1)}{" "}
                    {nearbyFast.distanceUnit} · {nearbyFast.maxPowerKw} kW
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        nearbyFast.availability === "Available"
                          ? "success"
                          : nearbyFast.availability === "Occupied"
                            ? "warning"
                            : "default"
                      }
                    >
                      {nearbyFast.availability.replace(/_/g, " ")}
                    </Badge>
                    <Link
                      href="/chargers"
                      className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      View on map
                      <MapPin className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-400">
                  Open the Chargers tab to search near you
                  {connectorStandards.length > 0
                    ? ` (${connectorStandards.join(", ")} compatible)`
                    : ""}
                  .
                </p>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="home-week-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="home-week-heading" className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Your week
          </h2>
          <Link href="/history" className="text-xs text-slate-400 hover:text-slate-200">
            All history
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-xs text-slate-400">Sessions</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{weekly.sessionCount}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Energy</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{weekly.energyKwh}</p>
            <p className="text-xs text-slate-500">kWh</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-slate-400">Spent</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {weekly.cost > 0 ? `$${weekly.cost.toFixed(0)}` : "—"}
            </p>
          </Card>
        </div>
        {weekly.sessionCount === 0 && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Start a session at a supported station to track costs here.
          </p>
        )}
      </section>

      <Card className="border-slate-800 bg-slate-900/50">
        <div className="flex gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-100/90">EV tip</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{tip}</p>
          </div>
        </div>
      </Card>

      <Card className="flex items-center gap-3 border-dashed border-slate-700 bg-transparent">
        <TrendingUp className="h-5 w-5 shrink-0 text-slate-500" />
        <p className="text-sm text-slate-400">
          <span className="text-slate-300">Coming soon:</span> home charging schedules, price
          alerts at your favorite stations, and trip reminders before you leave.
        </p>
      </Card>
    </div>
  );
}
