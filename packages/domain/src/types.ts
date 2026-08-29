export type ConnectorStandard = "CCS" | "NACS" | "CHAdeMO" | "Type2";
export type AvailabilityStatus = "Available" | "Occupied" | "Out_Of_Service" | "Unknown";
export type DistanceUnit = "km" | "mi";
export type ChargingStatus = "charging" | "idle";

export interface Connector {
  id: string;
  standard: ConnectorStandard;
  maxPowerKw: number;
  availability: AvailabilityStatus;
  pricePerKwh: number | "Unknown";
  currency: string;
}

export interface ChargingStation {
  id: string;
  operatorName: string;
  latitude: number;
  longitude: number;
  networkId: string;
  accessRules: string | "Unknown";
  connectors: Connector[];
  remoteStartSupported: boolean;
  lastFeedUpdate: string;
}

export interface VehicleProfile {
  id: string;
  make: string;
  model: string;
  year: number;
  batteryKwh: number;
  connectorStandards: ConnectorStandard[];
  efficiencyWhKm: number;
  deletedAt?: string;
}

export interface VehicleState {
  socPct: number | null;
  rangeKm: number | null;
  pluggedIn: boolean | null;
  chargingStatus: ChargingStatus | null;
  capturedAt: string | null;
  fieldAvailability: {
    socPct: boolean;
    rangeKm: boolean;
    pluggedIn: boolean;
    chargingStatus: boolean;
  };
}

export interface ChargingSession {
  id: string;
  vehicleId: string;
  stationId: string;
  connectorId: string;
  startTs: string;
  endTs?: string;
  energyKwh: number;
  peakKw?: number;
  cost: number | null;
  currency: string;
  costState: "NETWORK" | "HOME_RATE" | "UNAVAILABLE";
  source: "NETWORK" | "MANUAL";
  status: "active" | "completed";
  instantaneousPowerKw?: number;
  lastRefreshAt?: string;
}

export interface ChargeStop {
  stationId: string;
  stationName: string;
  arrivalSocPct: number;
  departureSocPct: number;
  chargingDurationMin: number;
  latitude: number;
  longitude: number;
  maxPowerKw?: number;
  connectorStandard?: ConnectorStandard;
  availability?: AvailabilityStatus;
  detourKm?: number;
}

export interface TripPlan {
  id: string;
  origin: { lat: number; lon: number; label: string };
  destination: { lat: number; lon: number; label: string };
  chargeStops: ChargeStop[];
  totalDistanceKm: number;
  totalDrivingMin: number;
  totalChargingMin: number;
  destinationSocPct: number;
  reserveSocPct: number;
  degradedLegs?: number[];
  /** Lat/lon pairs for map display */
  routeCoordinates?: Array<[number, number]>;
  routingSource?: "osrm" | "google_routes" | "direct";
}

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
  correlationId: string;
}

export interface OwnerAccount {
  id: string;
  email: string;
  timeZone: string;
  distanceUnit: DistanceUnit;
  reserveSoc: number;
  activeVehicleId: string | null;
}
