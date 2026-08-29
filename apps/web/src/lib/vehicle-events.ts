export const ACTIVE_VEHICLE_CHANGED_EVENT = "ev-active-vehicle-changed";

export function notifyActiveVehicleChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVE_VEHICLE_CHANGED_EVENT));
  }
}
