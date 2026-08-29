"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChargersView } from "@/components/chargers-view";
import { apiFetch, getAuthToken } from "@/lib/utils";
import { resolveVehicleKind } from "@/lib/vehicle-kind";
import { ACTIVE_VEHICLE_CHANGED_EVENT } from "@/lib/vehicle-events";
import type { VehicleKind } from "@ev/domain";

export default function ChargersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [vehicleKind, setVehicleKind] = useState<VehicleKind>("car");
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const me = await apiFetch<{
          activeVehicle: {
            make: string;
            model: string;
            vehicleKind?: string;
            batteryKwh?: number;
            efficiencyWhKm?: number;
          } | null;
        }>("/api/me");
        if (cancelled) return;
        if (me.activeVehicle) {
          setVehicleKind(resolveVehicleKind(me.activeVehicle));
          setVehicleLabel(`${me.activeVehicle.make} ${me.activeVehicle.model}`);
        } else {
          setVehicleKind("car");
          setVehicleLabel(null);
        }
      } catch {
        if (!cancelled) setVehicleKind("car");
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void load();

    const onVehicleChange = () => {
      void load();
    };
    window.addEventListener(ACTIVE_VEHICLE_CHANGED_EVENT, onVehicleChange);
    window.addEventListener("focus", onVehicleChange);

    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_VEHICLE_CHANGED_EVENT, onVehicleChange);
      window.removeEventListener("focus", onVehicleChange);
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        Loading your vehicle…
      </div>
    );
  }

  return (
    <ChargersView
      vehicleKind={vehicleKind}
      vehicleLabel={vehicleLabel}
      showMap={vehicleKind !== "bike"}
    />
  );
}
