import { haversineKm, type AvailabilityStatus, type ChargingStation, type ConnectorStandard } from "@ev/domain";

type GoogleConnectorAggregation = {
  type?: string;
  maxChargeRateKw?: number;
  count?: number;
  availableCount?: number;
  outOfServiceCount?: number;
  availabilityLastUpdateTime?: string;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  evChargeOptions?: {
    connectorCount?: number;
    connectorAggregation?: GoogleConnectorAggregation[];
  };
};

const CONNECTOR_MAP: Record<string, ConnectorStandard> = {
  EV_CONNECTOR_TYPE_J1772: "Type2",
  EV_CONNECTOR_TYPE_TYPE_2: "Type2",
  EV_CONNECTOR_TYPE_CHADEMO: "CHAdeMO",
  EV_CONNECTOR_TYPE_CCS_COMBO_1: "CCS",
  EV_CONNECTOR_TYPE_CCS_COMBO_2: "CCS",
  EV_CONNECTOR_TYPE_TESLA: "NACS",
  EV_CONNECTOR_TYPE_NACS: "NACS",
};

function mapConnectorType(type?: string): ConnectorStandard {
  if (!type) return "CCS";
  return CONNECTOR_MAP[type] ?? "CCS";
}

function mapAvailability(agg: GoogleConnectorAggregation): AvailabilityStatus {
  const count = agg.count ?? 0;
  const available = agg.availableCount ?? 0;
  const outOfService = agg.outOfServiceCount ?? 0;
  if (count === 0) return "Unknown";
  if (available > 0) return "Available";
  if (outOfService >= count) return "Out_Of_Service";
  if (available === 0) return "Occupied";
  return "Unknown";
}

function latestFeedUpdate(aggregations: GoogleConnectorAggregation[]): string {
  const times = aggregations
    .map((a) => a.availabilityLastUpdateTime)
    .filter((t): t is string => Boolean(t));
  if (times.length === 0) return new Date().toISOString();
  return times.sort().reverse()[0]!;
}

export function mapGooglePlaceToStation(
  place: GooglePlace,
  origin: { lat: number; lon: number }
): (ChargingStation & { distanceKm: number }) | null {
  const lat = place.location?.latitude;
  const lon = place.location?.longitude;
  if (lat == null || lon == null || !place.id) return null;

  const aggregations = place.evChargeOptions?.connectorAggregation ?? [];
  const lastFeedUpdate = latestFeedUpdate(aggregations);

  const connectors =
    aggregations.length > 0
      ? aggregations.map((agg, idx) => ({
          id: `${place.id}_c${idx}`,
          standard: mapConnectorType(agg.type),
          maxPowerKw: Math.round(agg.maxChargeRateKw ?? 50),
          availability: mapAvailability(agg),
          pricePerKwh: "Unknown" as const,
          currency: "USD",
        }))
      : [
          {
            id: `${place.id}_c0`,
            standard: "CCS" as ConnectorStandard,
            maxPowerKw: 50,
            availability: "Unknown" as AvailabilityStatus,
            pricePerKwh: "Unknown" as const,
            currency: "USD",
          },
        ];

  const placeId = place.id.replace(/^places\//, "");

  return {
    id: `gmap_${placeId}`,
    operatorName: place.displayName?.text ?? "EV charging station",
    latitude: lat,
    longitude: lon,
    networkId: "google_places",
    accessRules: place.formattedAddress ?? "Unknown",
    remoteStartSupported: false,
    lastFeedUpdate,
    connectors,
    distanceKm: haversineKm(origin.lat, origin.lon, lat, lon),
  };
}
