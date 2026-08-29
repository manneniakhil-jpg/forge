export function formatAgeMinutes(capturedAt: string | null, now = Date.now()): {
  minutes: number;
  display: string;
  isStale: boolean;
} {
  if (!capturedAt) {
    return { minutes: -1, display: "unavailable", isStale: true };
  }
  const ageMs = now - new Date(capturedAt).getTime();
  const minutes = Math.floor(ageMs / 60000);
  if (minutes >= 1440) {
    return { minutes, display: "1,440 minutes or more", isStale: true };
  }
  return {
    minutes,
    display: `${minutes} min ago`,
    isStale: minutes >= 24 * 60,
  };
}

export function formatAgeSeconds(capturedAt: string | null, now = Date.now()): {
  seconds: number;
  isStale: boolean;
} {
  if (!capturedAt) return { seconds: -1, isStale: true };
  const seconds = Math.floor((now - new Date(capturedAt).getTime()) / 1000);
  return { seconds, isStale: seconds > 180 };
}

export function isFeedStale(lastFeedUpdate: string, now = Date.now()): boolean {
  const ageMs = now - new Date(lastFeedUpdate).getTime();
  return ageMs > 10 * 60 * 1000;
}

export function resolveAvailability(
  status: string,
  lastFeedUpdate: string,
  now = Date.now()
): string {
  if (isFeedStale(lastFeedUpdate, now)) return "Unknown";
  return status;
}
