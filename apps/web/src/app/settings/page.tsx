"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Car, Check, Plus } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { apiFetch, getAuthToken } from "@/lib/utils";
import { ACTIVE_VEHICLE_CHANGED_EVENT } from "@/lib/vehicle-events";
import type { ConnectorStandard, VehicleKind } from "@ev/domain";

type VehicleRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  vehicleKind: VehicleKind;
  batteryKwh: number;
  connectorStandards: ConnectorStandard[];
  efficiencyWhKm: number;
};

const TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [distanceUnit, setDistanceUnit] = useState<"km" | "mi">("mi");
  const [reserveSoc, setReserveSoc] = useState("10");
  const [timeZone, setTimeZone] = useState("America/Los_Angeles");
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    try {
      const [me, vehicleData] = await Promise.all([
        apiFetch<{
          account: {
            email: string;
            distanceUnit: "km" | "mi";
            reserveSoc: number;
            timeZone: string;
            activeVehicleId: string | null;
          };
        }>("/api/me"),
        apiFetch<{ vehicles: VehicleRow[] }>("/api/vehicles"),
      ]);
      setEmail(me.account.email);
      setDistanceUnit(me.account.distanceUnit);
      setReserveSoc(String(me.account.reserveSoc ?? 10));
      setTimeZone(me.account.timeZone ?? "America/Los_Angeles");
      setActiveVehicleId(me.account.activeVehicleId);
      setVehicles(vehicleData.vehicles);
    } catch {
      router.replace("/auth");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [router]);

  const savePreferences = async () => {
    const reserve = parseInt(reserveSoc, 10);
    if (Number.isNaN(reserve) || reserve < 5 || reserve > 40) {
      setError("Reserve charge must be between 5 and 40%.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/me", {
        method: "PUT",
        body: JSON.stringify({
          distanceUnit,
          reserveSoc: reserve,
          timeZone,
        }),
      });
      setMessage("Preferences saved.");
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const switchVehicle = async (vehicleId: string) => {
    if (vehicleId === activeVehicleId || switchingId) return;
    setSwitchingId(vehicleId);
    setError(null);
    try {
      await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PUT",
        body: JSON.stringify({ action: "setActive" }),
      });
      setActiveVehicleId(vehicleId);
      setMessage("Active vehicle updated.");
      window.dispatchEvent(new Event(ACTIVE_VEHICLE_CHANGED_EVENT));
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Could not switch vehicle.");
    } finally {
      setSwitchingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-400">Preferences, vehicles, and defaults for trip planning.</p>
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-900/30 px-4 py-3 text-sm text-emerald-200">{message}</p>
      )}
      {error && (
        <p className="rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Account</h2>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} readOnly className="text-slate-400" />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <div>
          <Label htmlFor="distanceUnit">Distance unit</Label>
          <select
            id="distanceUnit"
            className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 text-base text-slate-100"
            value={distanceUnit}
            onChange={(e) => setDistanceUnit(e.target.value as "km" | "mi")}
          >
            <option value="mi">Miles</option>
            <option value="km">Kilometers</option>
          </select>
        </div>
        <div>
          <Label htmlFor="reserveSoc">Default reserve charge (%)</Label>
          <Input
            id="reserveSoc"
            type="number"
            min={5}
            max={40}
            value={reserveSoc}
            onChange={(e) => setReserveSoc(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Minimum buffer kept on trips and range estimates (5–40%).
          </p>
        </div>
        <div>
          <Label htmlFor="timeZone">Time zone</Label>
          <select
            id="timeZone"
            className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 text-base text-slate-100"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
          >
            {TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={savePreferences} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Your vehicles</h2>
          {vehicles.length < 5 && (
            <Link
              href="/auth?setup=1"
              className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
            >
              <Plus className="h-4 w-4" />
              Add
            </Link>
          )}
        </div>
        {vehicles.length === 0 ? (
          <p className="text-sm text-slate-400">
            No vehicles yet.{" "}
            <Link href="/auth?setup=1" className="text-emerald-400 hover:text-emerald-300">
              Add your EV
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {vehicles.map((vehicle) => {
              const isActive = vehicle.id === activeVehicleId;
              return (
                <li
                  key={vehicle.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    isActive ? "border-emerald-600/50 bg-emerald-950/20" : "border-slate-700"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                    <Car className="h-5 w-5 text-slate-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-xs text-slate-400">
                      {vehicle.vehicleKind === "bike" ? "E-bike" : "Car"} · {vehicle.batteryKwh} kWh ·{" "}
                      {vehicle.connectorStandards.join(", ")}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-900/60 px-2.5 py-1 text-xs font-medium text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                      Active
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={switchingId === vehicle.id}
                      onClick={() => void switchVehicle(vehicle.id)}
                    >
                      {switchingId === vehicle.id ? "Switching…" : "Use this car"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
