"use client";

import Link from "next/link";
import { MapPin, Navigation, Zap } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { NearbyFastCharger } from "@/lib/home-insights";
import { googleMapsDirectionsUrl } from "@/lib/navigation-links";
import { convertDistance } from "@ev/domain";

function availabilityBadgeVariant(availability: string) {
  if (availability === "Available") return "success" as const;
  if (availability === "Occupied") return "warning" as const;
  return "default" as const;
}

export function HomeClosestCharger({
  nearbyFast,
  nearbyLoading,
  userLocation,
}: {
  nearbyFast: NearbyFastCharger | null;
  nearbyLoading: boolean;
  userLocation: { lat: number; lon: number } | null;
}) {
  return (
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
  );
}
