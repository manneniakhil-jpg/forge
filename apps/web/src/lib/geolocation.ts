export type GeoPoint = { lat: number; lon: number };

export function getCurrentLocation(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              "Location permission denied. Allow location access in your browser to use Locate me."
            )
          );
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error("Your location is unavailable right now. Try again in a moment."));
          return;
        }
        if (err.code === err.TIMEOUT) {
          reject(new Error("Location request timed out. Try again."));
          return;
        }
        reject(new Error("Could not determine your location."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}
