export type GeoPoint = { lat: number; lon: number };

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function geolocationErrorMessage(code: number): string {
  switch (code) {
    case PERMISSION_DENIED:
      return "Location permission denied. Allow location access in your browser settings, then try again.";
    case POSITION_UNAVAILABLE:
      return "Your location is unavailable right now. Try again in a moment.";
    case TIMEOUT:
      return "Location request timed out. Try again.";
    default:
      return "Could not determine your location.";
  }
}

function requestPosition(options: PositionOptions): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      (err) => reject(new Error(geolocationErrorMessage(err.code))),
      options
    );
  });
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function isSecureGeolocationContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext;
}

export async function getCurrentLocation(): Promise<GeoPoint> {
  if (!isGeolocationSupported()) {
    throw new Error("Geolocation is not supported on this device.");
  }
  if (!isSecureGeolocationContext()) {
    throw new Error(
      "Location requires a secure connection (HTTPS). Open the app via https:// or localhost."
    );
  }

  try {
    return await requestPosition({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  } catch (first) {
    try {
      return await requestPosition({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      });
    } catch {
      throw first instanceof Error ? first : new Error("Could not determine your location.");
    }
  }
}
