import type { VehicleKind } from "@ev/domain";

type VehicleKindInput = {
  vehicleKind?: string | null;
  batteryKwh?: number;
  efficiencyWhKm?: number;
} | null | undefined;

/** Resolve car vs bike from stored kind or legacy heuristics (small battery / low Wh-km). */
export function resolveVehicleKind(vehicle: VehicleKindInput): VehicleKind {
  if (!vehicle) return "car";
  if (vehicle.vehicleKind === "bike" || vehicle.vehicleKind === "car") {
    return vehicle.vehicleKind;
  }
  if (vehicle.batteryKwh != null && vehicle.batteryKwh <= 5) return "bike";
  if (vehicle.efficiencyWhKm != null && vehicle.efficiencyWhKm <= 80) return "bike";
  return "car";
}
