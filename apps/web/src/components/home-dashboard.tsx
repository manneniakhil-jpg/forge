"use client";

import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Gauge,
  Heart,
  Lightbulb,
  MapPin,
  Navigation,
  Route,
  Zap,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import {
  chargeToTargetInsight,
  rangeInsight,
  tipForToday,
  type FavoriteStationGlance,
  type NearbyFastCharger,
  type ReachCheck,
} from "@/lib/home-insights";
import { googleMapsDirectionsUrl } from "@/lib/navigation-links";
import { convertDistance, type ConnectorStandard } from "@ev/domain";

type WeeklyStats = {
  sessionCount: number;
  energyKwh: number;
  cost: number;
  avgCostPerKwh: number | null;
};

function availabilityBadgeVariant(availability: string) {
  if (availability === "Available") return "success" as const;
  if (availability === "Occupied") return "warning" as const;
  return "default" as const;
}

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
  favorites,
  reachCheck,
  userLocation,
  isCharging,
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
  favorites: FavoriteStationGlance[];
  reachCheck: ReachCheck | null;
  userLocation: { lat: number; lon: number } | null;
  isCharging: boolean;
}) {
  const insight = rangeInsight(
    socPct,
    batteryKwh,
    efficiencyWhKm,
    reserveSocPct,
    distanceUnit
  );
  const tip = tipForToday();
  const chargePower = nearbyFast?.maxPowerKw ?? 150;
  const chargeTarget =
    !isCharging && socPct != null && socPct < 80
      ? chargeToTargetInsight(socPct, batteryKwh, 80, chargePower)
      : null;

  const insightBorder =
    insight.tone === "warn"
      ? "border-amber-700/40"
      : insight.tone === "good"
        ? "border-emerald-700/40"
        : "border-slate-700";

  return (
    <div className="space-y-5">
      <section aria-labelledby="home-job-range">
        <h2
          id="home-job-range"
          className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-500"
        >
          Do I have enough range?
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Know before you leave — charge level drives every estimate below.
        </p>

        <div className="space-y-3">
          <Card className={`border ${insightBorder}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-400">
                <Gauge className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{insight.headline}</p>
                <p className="mt-1 text-sm text-slate-400">{insight.detail}</p>
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

          {chargeTarget && (
            <Card className="border-emerald-700/30">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="font-semibold">{chargeTarget.headline}</p>
                  <p className="mt-1 text-sm text-slate-400">{chargeTarget.detail}</p>
                </div>
              </div>
            </Card>
          )}

          {reachCheck && socPct != null && (
            <Card
              className={
                reachCheck.needsChargeStop ? "border-amber-700/30" : "border-emerald-700/30"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-400">Your last trip</p>
                  <p className="font-semibold">{reachCheck.headline}</p>
                  <p className="mt-1 text-sm text-slate-400">{reachCheck.detail}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/trips"
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600/20 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30"
                >
                  {reachCheck.needsChargeStop ? "Plan with charge stops" : "Plan this trip"}
                  <Route className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          )}
        </div>
      </section>

      <section aria-labelledby="home-job-charge">
        <h2
          id="home-job-charge"
          className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-500"
        >
          Where can I charge?
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Compatible with your {connectorStandards.join(", ")} connector
          {connectorStandards.length > 1 ? "s" : ""}.
        </p>

        <div className="space-y-3">
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400">
                <Zap className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Closest fast charger</p>
                {nearbyLoading ? (
                  <p className="mt-1 text-sm text-slate-400">Checking near you…</p>
                ) : nearbyFast ? (
                  <>
                    <p className="mt-1 text-sm text-slate-300">
                      {nearbyFast.name} ·{" "}
                      {convertDistance(nearbyFast.distanceKm, nearbyFast.distanceUnit).toFixed(1)}{" "}
                      {nearbyFast.distanceUnit} · {nearbyFast.maxPowerKw} kW
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={availabilityBadgeVariant(nearbyFast.availability)}>
                        {nearbyFast.availability.replace(/_/g, " ")}
                      </Badge>
                      <a
                        href={googleMapsDirectionsUrl(
                          { lat: nearbyFast.latitude, lon: nearbyFast.longitude },
                          userLocation
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Directions
                      </a>
                      <Link
                        href="/chargers"
                        className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
                      >
                        Start session
                        <MapPin className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">
                    Allow location or search on the Chargers tab.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {favorites.length > 0 && (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Heart className="h-4 w-4 text-rose-400" />
                <p className="font-semibold">Saved stations</p>
              </div>
              <ul className="space-y-2">
                {favorites.map((station) => (
                  <li
                    key={station.id}
                    className="rounded-lg bg-slate-900/60 px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{station.name}</p>
                        <p className="text-xs text-slate-400">
                          {convertDistance(station.distanceKm, station.distanceUnit).toFixed(1)}{" "}
                          {station.distanceUnit} · {station.maxPowerKw} kW
                        </p>
                      </div>
                      <Badge variant={availabilityBadgeVariant(station.availability)}>
                        {station.availability.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <a
                        href={googleMapsDirectionsUrl(
                          { lat: station.latitude, lon: station.longitude },
                          userLocation
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Directions
                      </a>
                      <Link
                        href="/chargers"
                        className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Open in app
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </section>

      <section aria-labelledby="home-job-cost">
        <div className="mb-1 flex items-center justify-between">
          <h2
            id="home-job-cost"
            className="text-sm font-medium uppercase tracking-wide text-slate-500"
          >
            What am I spending?
          </h2>
          <Link href="/history" className="text-xs text-slate-400 hover:text-slate-200">
            All history
          </Link>
        </div>
        <p className="mb-3 text-xs text-slate-500">Last 7 days of public charging.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Card className="text-center">
            <p className="text-xs text-slate-400">Avg rate</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {weekly.avgCostPerKwh != null ? `$${weekly.avgCostPerKwh.toFixed(2)}` : "—"}
            </p>
            <p className="text-xs text-slate-500">/kWh</p>
          </Card>
        </div>
        {weekly.sessionCount === 0 && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Start a session from the Chargers tab to track spending here.
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
    </div>
  );
}
