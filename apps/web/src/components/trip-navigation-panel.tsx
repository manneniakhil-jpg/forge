"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Apple,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
} from "lucide-react";
import type { TripPlan } from "@ev/domain";
import { Button } from "@/components/ui";
import {
  activeStepIndex,
  buildTripNavigation,
  formatDistance,
  formatDuration,
  navigationUrlsForPlan,
  type NavigationStep,
  type TripNavigation,
} from "@/lib/navigation-steps";

type UserLocation = { lat: number; lon: number };

export function TripNavigationPanel({
  plan,
  userLocation,
  onUserLocationChange,
}: {
  plan: TripPlan;
  userLocation: UserLocation | null;
  onUserLocationChange?: (loc: UserLocation | null) => void;
}) {
  const urls = useMemo(() => navigationUrlsForPlan(plan), [plan]);
  const [navigating, setNavigating] = useState(false);
  const [navigation, setNavigation] = useState<TripNavigation | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const currentStepIdx = useMemo(() => {
    if (!navigation || !userLocation) return 0;
    return activeStepIndex(navigation.steps, userLocation);
  }, [navigation, userLocation]);

  const currentStep = navigation?.steps[currentStepIdx];
  const nextStep = navigation?.steps[currentStepIdx + 1];

  const startInAppNavigation = useCallback(async () => {
    setStepsError(null);
    setLoadingSteps(true);
    setNavigating(true);
    try {
      const result = await buildTripNavigation(plan);
      if (!result) {
        setStepsError("Could not load turn-by-turn directions. Try Google Maps instead.");
        setNavigating(false);
        return;
      }
      setNavigation(result);
    } catch {
      setStepsError("Could not load turn-by-turn directions.");
      setNavigating(false);
    } finally {
      setLoadingSteps(false);
    }
  }, [plan]);

  useEffect(() => {
    if (!navigating || !onUserLocationChange) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onUserLocationChange({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      () => onUserLocationChange(null),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [navigating, onUserLocationChange]);

  const stopNavigation = () => {
    setNavigating(false);
    setShowAllSteps(false);
    onUserLocationChange?.(null);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-emerald-400" />
            <h3 className="font-semibold">Navigation</h3>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Open in Google Maps or Apple Maps, or follow turn-by-turn here.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <a
          href={urls.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <ExternalLink className="h-4 w-4" />
          Open in Google Maps
        </a>
        <a
          href={urls.appleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          <Apple className="h-4 w-4" />
          Open in Apple Maps
        </a>
      </div>

      {!navigating ? (
        <Button className="w-full" variant="secondary" onClick={startInAppNavigation} disabled={loadingSteps}>
          {loadingSteps ? "Loading directions…" : "Start in-app navigation"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
              Live navigation
            </p>
            <Button variant="ghost" size="sm" onClick={stopNavigation}>
              Stop
            </Button>
          </div>

          {stepsError && (
            <p className="rounded-xl bg-red-900/30 px-3 py-2 text-sm text-red-200">{stepsError}</p>
          )}

          {currentStep && (
            <div className="rounded-xl border border-emerald-800/60 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Now</p>
              <p className="mt-1 text-lg font-semibold leading-snug">{currentStep.instruction}</p>
              <p className="mt-2 text-sm text-slate-400">
                {formatDistance(currentStep.distanceM)} · {formatDuration(currentStep.durationS)}
              </p>
              {!userLocation && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-300">
                  <LocateFixed className="h-3.5 w-3.5" />
                  Enable location for live step updates
                </p>
              )}
            </div>
          )}

          {nextStep && (
            <div className="rounded-xl border border-slate-700/80 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Then</p>
              <p className="mt-1 text-sm text-slate-200">{nextStep.instruction}</p>
            </div>
          )}

          {plan.chargeStops.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Charge stops on route
              </p>
              {plan.chargeStops.map((stop, i) => (
                <div
                  key={stop.stationId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/80 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                    Stop {i + 1}: {stop.stationName}
                  </span>
                </div>
              ))}
            </div>
          )}

          {navigation && navigation.steps.length > 0 && (
            <div>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-400 hover:bg-slate-800/60"
                onClick={() => setShowAllSteps((v) => !v)}
              >
                <span>All directions ({navigation.steps.length} steps)</span>
                {showAllSteps ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showAllSteps && (
                <ol className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {navigation.steps.map((step, i) => (
                    <StepRow key={i} step={step} active={i === currentStepIdx} index={i + 1} />
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepRow({
  step,
  active,
  index,
}: {
  step: NavigationStep;
  active: boolean;
  index: number;
}) {
  return (
    <li
      className={`rounded-lg px-3 py-2 text-sm ${
        active ? "border border-emerald-700/80 bg-emerald-950/40" : "bg-slate-900/50"
      }`}
    >
      <span className="mr-2 text-slate-500">{index}.</span>
      {step.instruction}
      <span className="ml-2 text-slate-500">({formatDistance(step.distanceM)})</span>
    </li>
  );
}
