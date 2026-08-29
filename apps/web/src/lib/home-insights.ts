import {
  computeUsableRangeKm,
  convertDistance,
  estimateChargeDurationMin,
  haversineKm,
  type ConnectorStandard,
} from "@ev/domain";
import type { SavedPlace } from "./home-storage";

export type DayTripIdea = {
  name: string;
  distanceKm: number;
  note: string;
};

/** Rough one-way distances from the Bay Area — used for "you could go…" prompts. */
export const DAY_TRIP_IDEAS: DayTripIdea[] = [
  { name: "Monterey", distanceKm: 185, note: "coastal drive" },
  { name: "Sacramento", distanceKm: 145, note: "weekend visit" },
  { name: "Lake Tahoe", distanceKm: 320, note: "mountain getaway" },
  { name: "Los Angeles", distanceKm: 615, note: "road trip" },
  { name: "Napa Valley", distanceKm: 80, note: "wine country" },
];

export const EV_TIPS: string[] = [
  "Charging from 20% to 80% is usually the fastest window on DC fast chargers — the last 20% slows down a lot.",
  "Precondition your battery while plugged in before a fast charge in cold weather. You'll spend less time at the stall.",
  "Public rates often peak in the afternoon. If your schedule allows, a morning charge can cost less.",
  "Keep a 10% reserve buffer in your head on highway trips — headwinds and hills can trim real-world range.",
  "A 150 kW stall with open plugs beats a 350 kW stall with a long wait. Availability matters as much as peak speed.",
];

export function tipForToday(): string {
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return EV_TIPS[dayIndex % EV_TIPS.length]!;
}

export function rangeInsight(
  socPct: number | null | undefined,
  batteryKwh: number,
  efficiencyWhKm: number,
  reserveSocPct: number,
  distanceUnit: "km" | "mi"
): { headline: string; detail: string; tone: "good" | "warn" | "neutral" } {
  if (socPct == null) {
    return {
      headline: "Update your charge level",
      detail: "Set your current charge so range and trip planning stay accurate.",
      tone: "neutral",
    };
  }

  const usableKm = computeUsableRangeKm(socPct, reserveSocPct, batteryKwh, efficiencyWhKm);
  const display = Math.round(convertDistance(usableKm, distanceUnit));
  const unit = distanceUnit;

  if (socPct <= 20) {
    return {
      headline: "Charge soon",
      detail: `About ${display} ${unit} of comfortable range left at your ${reserveSocPct}% reserve.`,
      tone: "warn",
    };
  }

  if (socPct <= 40) {
    return {
      headline: "Good for local driving",
      detail: `Roughly ${display} ${unit} before you need to think about a stop.`,
      tone: "neutral",
    };
  }

  const reachable = DAY_TRIP_IDEAS.filter((trip) => trip.distanceKm <= usableKm * 0.85).sort(
    (a, b) => b.distanceKm - a.distanceKm
  )[0];

  if (reachable) {
    return {
      headline: `Enough range for ${reachable.name}`,
      detail: `${display} ${unit} usable — a ${reachable.note} is within reach on one charge.`,
      tone: "good",
    };
  }

  return {
    headline: "You're in good shape",
    detail: `${display} ${unit} of comfortable range for today's driving.`,
    tone: "good",
  };
}

export function weeklySummary(sessions: Array<{ startTs: string; energyKwh: number; cost: number | null }>) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = sessions.filter((s) => new Date(s.startTs).getTime() >= weekAgo);
  const energy = recent.reduce((sum, s) => sum + (s.energyKwh || 0), 0);
  const cost = recent.reduce((sum, s) => sum + (s.cost || 0), 0);
  return {
    sessionCount: recent.length,
    energyKwh: Math.round(energy * 10) / 10,
    cost: Math.round(cost * 100) / 100,
    avgCostPerKwh: energy > 0 ? Math.round((cost / energy) * 100) / 100 : null,
  };
}

export function chargeToTargetInsight(
  socPct: number | null | undefined,
  batteryKwh: number,
  targetSoc: number,
  powerKw: number
): { headline: string; detail: string } | null {
  if (socPct == null || socPct >= targetSoc) return null;
  const minutes = estimateChargeDurationMin(socPct, targetSoc, batteryKwh, powerKw);
  return {
    headline: `~${minutes} min to ${targetSoc}%`,
    detail: `At about ${powerKw} kW — the usual target before a highway trip.`,
  };
}

export type ReachCheck = {
  destinationLabel: string;
  distanceKm: number;
  usableKm: number;
  needsChargeStop: boolean;
  headline: string;
  detail: string;
};

/** Straight-line sanity check — full trip planner handles roads and charge stops. */
export function reachCheckToPlace(
  origin: { lat: number; lon: number },
  destination: SavedPlace,
  socPct: number,
  batteryKwh: number,
  efficiencyWhKm: number,
  reserveSocPct: number,
  distanceUnit: "km" | "mi"
): ReachCheck {
  const distanceKm = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const usableKm = computeUsableRangeKm(
    socPct,
    reserveSocPct,
    batteryKwh,
    efficiencyWhKm
  );
  const label = destination.label.split(",").slice(0, 2).join(",").trim();
  const distDisplay = Math.round(convertDistance(distanceKm, distanceUnit));
  const usableDisplay = Math.round(convertDistance(usableKm, distanceUnit));
  const unit = distanceUnit;
  const needsChargeStop = distanceKm > usableKm * 0.92;

  if (!needsChargeStop) {
    return {
      destinationLabel: label,
      distanceKm,
      usableKm,
      needsChargeStop: false,
      headline: `You can likely reach ${label}`,
      detail: `~${distDisplay} ${unit} away · ${usableDisplay} ${unit} comfortable range at ${socPct}%.`,
    };
  }

  return {
    destinationLabel: label,
    distanceKm,
    usableKm,
    needsChargeStop: true,
    headline: `${label} needs a charge stop`,
    detail: `~${distDisplay} ${unit} away exceeds your ~${usableDisplay} ${unit} range — plan a route with stops.`,
  };
}

export type FavoriteStationGlance = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  maxPowerKw: number;
  availability: string;
  distanceUnit: "km" | "mi";
};

export function pickFavoriteStations(
  stations: Array<{
    id: string;
    operatorName: string;
    latitude: number;
    longitude: number;
    distanceKm: number;
    connectors: Array<{ maxPowerKw: number; availability: string; standard: ConnectorStandard }>;
  }>,
  favoriteIds: string[],
  vehicleConnectors: ConnectorStandard[],
  distanceUnit: "km" | "mi",
  limit = 3
): FavoriteStationGlance[] {
  const favoriteSet = new Set(favoriteIds);

  return stations
    .filter((station) => favoriteSet.has(station.id))
    .map((station) => {
      const formatted = formatNearbyCharger(station, vehicleConnectors, distanceUnit);
      if (!formatted) return null;
      return {
        id: station.id,
        name: formatted.name,
        latitude: station.latitude,
        longitude: station.longitude,
        distanceKm: formatted.distanceKm,
        maxPowerKw: formatted.maxPowerKw,
        availability: formatted.availability,
        distanceUnit,
      };
    })
    .filter((station): station is FavoriteStationGlance => station !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export type NearbyFastCharger = {
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  maxPowerKw: number;
  availability: string;
  distanceUnit: "km" | "mi";
};

export function formatNearbyCharger(
  station: {
    operatorName: string;
    latitude: number;
    longitude: number;
    distanceKm: number;
    connectors: Array<{ maxPowerKw: number; availability: string; standard: ConnectorStandard }>;
  },
  vehicleConnectors: ConnectorStandard[],
  distanceUnit: "km" | "mi"
): NearbyFastCharger | null {
  const compatible = station.connectors.filter(
    (c) =>
      vehicleConnectors.includes(c.standard) &&
      c.availability !== "Out_Of_Service" &&
      c.maxPowerKw >= 50
  );
  if (compatible.length === 0) return null;

  const maxPowerKw = Math.max(...compatible.map((c) => c.maxPowerKw));
  const availability =
    compatible.find((c) => c.availability === "Available")?.availability ??
    compatible[0]?.availability ??
    "Unknown";

  return {
    name: station.operatorName,
    latitude: station.latitude,
    longitude: station.longitude,
    distanceKm: station.distanceKm,
    maxPowerKw,
    availability,
    distanceUnit,
  };
}
