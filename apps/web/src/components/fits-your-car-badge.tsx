import type { ChargingStation, ConnectorStandard } from "@ev/domain";
import { isStationCompatible } from "@/lib/charger-sort";

function matchingStandards(
  station: ChargingStation,
  vehicleConnectors: ConnectorStandard[]
): ConnectorStandard[] {
  const seen = new Set<ConnectorStandard>();
  for (const connector of station.connectors) {
    if (vehicleConnectors.includes(connector.standard)) {
      seen.add(connector.standard);
    }
  }
  return [...seen];
}

export function FitsYourCarBadge({
  station,
  vehicleConnectors,
  className = "",
}: {
  station: ChargingStation;
  vehicleConnectors: ConnectorStandard[];
  className?: string;
}) {
  if (vehicleConnectors.length === 0 || !isStationCompatible(station, vehicleConnectors)) {
    return null;
  }

  const standards = matchingStandards(station, vehicleConnectors);
  const detail = standards.length > 0 ? ` · ${standards.join(", ")}` : "";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-emerald-500/50 bg-emerald-950/60 px-2.5 py-1 text-xs font-medium leading-none text-emerald-200 whitespace-nowrap ${className}`}
    >
      Fits your car{detail}
    </span>
  );
}

export function NoMatchBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-slate-600 bg-slate-800/80 px-2.5 py-1 text-xs font-medium leading-none text-slate-400 whitespace-nowrap ${className}`}
    >
      No match
    </span>
  );
}
