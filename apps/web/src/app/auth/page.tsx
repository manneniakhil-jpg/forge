"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Battery, Mail, Lock } from "lucide-react";
import { Button, Input, Label, Card } from "@/components/ui";
import { apiFetch, setAuthToken, getAuthToken } from "@/lib/utils";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupMode = searchParams.get("setup") === "1";
  const [mode, setMode] = useState<"signin" | "register">(setupMode ? "register" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"account" | "vehicle">("account");
  const [catalog, setCatalog] = useState<Array<Record<string, unknown>>>([]);
  const [vehicleForm, setVehicleForm] = useState({
    make: "Tesla",
    model: "Model 3 Long Range",
    year: 2024,
  });

  useEffect(() => {
    if (getAuthToken() && !setupMode) router.replace("/");
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setCatalog(d.catalog ?? []));
  }, [router, setupMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const path = mode === "register" ? "/api/accounts" : "/api/sessions";
      const data = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.json());

      if (data.code) {
        setError(data.message || data.code);
        return;
      }
      setAuthToken(data.token);
      if (mode === "register" || setupMode) {
        setStep("vehicle");
      } else {
        router.replace("/");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const addVehicle = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(vehicleForm),
      });
      router.replace("/");
    } catch (e) {
      setError((e as { message?: string }).message || "Could not add vehicle");
    } finally {
      setLoading(false);
    }
  };

  const makes = [...new Set(catalog.map((v) => v.make as string))];
  const models = catalog.filter((v) => v.make === vehicleForm.make);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600">
          <Battery className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold">EV Companion</h1>
        <p className="max-w-sm text-slate-400">
          Charge smarter — see your battery, find compatible chargers, and plan road trips.
        </p>
      </div>

      <Card className="w-full max-w-md">
        {step === "account" ? (
          <>
            <div className="mb-6 flex rounded-xl bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium min-h-[44px] ${
                  mode === "signin" ? "bg-slate-900 text-white" : "text-slate-400"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-medium min-h-[44px] ${
                  mode === "register" ? "bg-slate-900 text-white" : "text-slate-400"
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Password (12+ characters)</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={12}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                  />
                </div>
              </div>
              {error && (
                <p className="rounded-xl bg-red-900/30 px-3 py-2 text-sm text-red-200" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
              </Button>
            </form>
          </>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Add your vehicle</h2>
            <p className="text-sm text-slate-400">Step 2 of 2 — pick your EV from our catalog</p>
            <div>
              <Label htmlFor="make">Make</Label>
              <select
                id="make"
                className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3"
                value={vehicleForm.make}
                onChange={(e) => {
                  const first = catalog.find((v) => v.make === e.target.value) as Record<string, unknown>;
                  setVehicleForm({
                    make: e.target.value,
                    model: (first?.model as string) ?? "",
                    year: (first?.year as number) ?? 2024,
                  });
                }}
              >
                {makes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                className="h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3"
                value={`${vehicleForm.model}|${vehicleForm.year}`}
                onChange={(e) => {
                  const [model, year] = e.target.value.split("|");
                  setVehicleForm({ ...vehicleForm, model, year: parseInt(year) });
                }}
              >
                {models.map((v) => (
                  <option key={`${v.model}-${v.year}`} value={`${v.model}|${v.year}`}>
                    {v.model as string} ({v.year as number})
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <p className="rounded-xl bg-red-900/30 px-3 py-2 text-sm text-red-200" role="alert">
                {error}
              </p>
            )}
            <Button className="w-full" onClick={addVehicle} disabled={loading}>
              {loading ? "Saving…" : "Finish setup"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>}>
      <AuthForm />
    </Suspense>
  );
}
