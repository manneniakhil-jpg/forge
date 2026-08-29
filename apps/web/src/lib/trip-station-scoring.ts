import {
  haversineKm,
  type AvailabilityStatus,
  type ChargingStation,
  type ConnectorStandard,
} from "@ev/domain";

function availabilityRank(status: AvailabilityStatus): number {
  switch (status) {
    case "Available":
      return 3;
    case "Unknown":
      return 2;
    case "Occupied":
      return 1;
    default:
      return 0;
  }
}

export function compatibleConnectors(
  station: ChargingStation,
  connectorStandards: ConnectorStandard[]
) {
  return station.connectors.filter(
    (c) => connectorStandards.includes(c.standard) && c.availability !== "Out_Of_Service"
  );
}

export function scoreChargingStation(
  station: ChargingStation,
  needChargeAt: { lat: number; lon: number },
  connectorStandards: ConnectorStandard[],
  arrivalSocPct: number,
  reserveSocPct: number
): number {
  const connectors = compatibleConnectors(station, connectorStandards);
  if (connectors.length === 0) return -Infinity;

  const detourKm = haversineKm(
    needChargeAt.lat,
    needChargeAt.lon,
    station.latitude,
    station.longitude
  );
  const maxPower = Math.max(...connectors.map((c) => c.maxPowerKw));
  const availability = Math.max(...connectors.map((c) => availabilityRank(c.availability)));

  const lowBattery = arrivalSocPct <= reserveSocPct + 8;
  const detourWeight = lowBattery ? 9 : 4;
  const powerWeight = lowBattery ? 5 : 10;

  return maxPower * powerWeight + availability * 18 - detourKm * detourWeight;
}

export function pickBestStation(
  candidates: Array<{ station: ChargingStation; distanceKm: number }>,
  needChargeAt: { lat: number; lon: number },
  connectorStandards: ConnectorStandard[],
  arrivalSocPct: number,
  reserveSocPct: number
): { station: ChargingStation; distanceKm: number } | null {
  let best: { station: ChargingStation; distanceKm: number } | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const score = scoreChargingStation(
      candidate.station,
      needChargeAt,
      connectorStandards,
      arrivalSocPct,
      reserveSocPct
    );
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function bestCompatibleConnector(
  station: ChargingStation,
  connectorStandards: ConnectorStandard[]
) {
  return compatibleConnectors(station, connectorStandards).sort(
    (a, b) => b.maxPowerKw - a.maxPowerKw
  )[0];
}

export function chargeStopReason(
  arrivalSocPct: number,
  reserveSocPct: number,
  maxPowerKw: number,
  availability: AvailabilityStatus,
  detourKm: number
): string {
  if (arrivalSocPct <= reserveSocPct + 5) {
    return `Closest reliable stop with ${maxPowerKw} kW before your reserve charge level`;
  }
  if (maxPowerKw >= 150) {
    return `Fast ${maxPowerKw} kW charger · ${availability.toLowerCase().replace(/_/g, " ")} · ${detourKm.toFixed(1)} km off route`;
  }
  return `Balanced for your ${arrivalSocPct}% arrival charge · ${maxPowerKw} kW · ${detourKm.toFixed(1)} km off route`;
}
