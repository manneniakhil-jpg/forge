import type { ConnectorStandard, DistanceUnit, VehicleKind } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): { valid: boolean; code?: string } {
  if (email.length < 3 || email.length > 254) {
    return { valid: false, code: "INVALID_EMAIL_FORMAT" };
  }
  if (!EMAIL_REGEX.test(email) || email.split("@").length !== 2) {
    return { valid: false, code: "INVALID_EMAIL_FORMAT" };
  }
  const [local, domain] = email.split("@");
  if (!local || !domain.includes(".")) {
    return { valid: false, code: "INVALID_EMAIL_FORMAT" };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; code?: string } {
  if (password.length < 12 || password.length > 128) {
    return { valid: false, code: "PASSWORD_LENGTH_INVALID" };
  }
  return { valid: true };
}

export function validateBatteryCapacity(
  kwh: number,
  kind: VehicleKind = "car"
): { valid: boolean; code?: string } {
  if (kind === "bike") {
    if (kwh < 0.3 || kwh > 5) {
      return { valid: false, code: "BATTERY_CAPACITY_OUT_OF_RANGE" };
    }
    return { valid: true };
  }
  if (kwh < 5 || kwh > 250) {
    return { valid: false, code: "BATTERY_CAPACITY_OUT_OF_RANGE" };
  }
  return { valid: true };
}

export function validateEfficiency(
  whKm: number,
  kind: VehicleKind = "car"
): { valid: boolean; field?: string } {
  if (kind === "bike") {
    if (whKm < 5 || whKm > 80) {
      return { valid: false, field: "efficiencyWhKm" };
    }
    return { valid: true };
  }
  if (whKm < 80 || whKm > 500) {
    return { valid: false, field: "efficiencyWhKm" };
  }
  return { valid: true };
}

export function validateConnectors(standards: ConnectorStandard[]): { valid: boolean; field?: string } {
  if (standards.length < 1 || standards.length > 5) {
    return { valid: false, field: "connectorStandards" };
  }
  return { valid: true };
}

export function validateManualSoc(soc: number): { valid: boolean } {
  if (!Number.isInteger(soc) || soc < 0 || soc > 100) {
    return { valid: false };
  }
  return { valid: true };
}

export function validateReserveSoc(soc: number): { valid: boolean } {
  if (!Number.isInteger(soc) || soc < 5 || soc > 40) {
    return { valid: false };
  }
  return { valid: true };
}

export function clampSoc(value: number): number | null {
  if (value < 0 || value > 100) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function computeRangeKm(
  socPct: number,
  batteryKwh: number,
  efficiencyWhKm: number
): number {
  const usableKwh = (batteryKwh * socPct) / 100;
  const rangeKm = (usableKwh * 1000) / efficiencyWhKm;
  return Math.round(Math.max(0, Math.min(1200, rangeKm)));
}

export function computeUsableRangeKm(
  socPct: number,
  reserveSocPct: number,
  batteryKwh: number,
  efficiencyWhKm: number
): number {
  const usablePct = Math.max(0, socPct - reserveSocPct);
  return computeRangeKm(usablePct, batteryKwh, efficiencyWhKm);
}

export function convertDistance(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? Math.round(km * 0.621371) : Math.round(km);
}

export function formatDistance(km: number, unit: DistanceUnit): string {
  const value = convertDistance(km, unit);
  return `${value} ${unit}`;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateSearchParams(params: {
  lat: number;
  lon: number;
  radiusKm: number;
  minPowerKw?: number;
  priceCeiling?: number;
}): { valid: boolean; field?: string } {
  if (params.lat < -90 || params.lat > 90) return { valid: false, field: "lat" };
  if (params.lon < -180 || params.lon > 180) return { valid: false, field: "lon" };
  if (params.radiusKm < 1 || params.radiusKm > 100) return { valid: false, field: "radiusKm" };
  if (params.minPowerKw !== undefined && (params.minPowerKw < 1 || params.minPowerKw > 1000)) {
    return { valid: false, field: "minPowerKw" };
  }
  if (params.priceCeiling !== undefined && (params.priceCeiling < 0.01 || params.priceCeiling > 100)) {
    return { valid: false, field: "priceCeiling" };
  }
  return { valid: true };
}

export function estimateChargeDurationMin(
  arrivalSoc: number,
  departureSoc: number,
  batteryKwh: number,
  maxPowerKw: number
): number {
  const energyNeeded = ((departureSoc - arrivalSoc) / 100) * batteryKwh;
  if (energyNeeded <= 0) return 1;
  const effectivePower = Math.min(maxPowerKw, batteryKwh * 0.5);
  const hours = energyNeeded / effectivePower;
  return Math.round(Math.max(1, Math.min(480, hours * 60)));
}
