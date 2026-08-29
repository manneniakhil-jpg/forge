"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Battery, History, MapPin, Route, LogOut } from "lucide-react";
import { cn, clearAuthToken } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home", icon: Battery },
  { href: "/chargers", label: "Chargers", icon: MapPin },
  { href: "/trips", label: "Trips", icon: Route },
  { href: "/history", label: "History", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/auth") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-slate-800 bg-slate-950 shadow-sm shadow-black/20">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600">
              <Battery className="h-5 w-5 text-white" aria-hidden />
            </div>
            <span className="text-lg font-semibold tracking-tight">EV Companion</span>
          </div>
          <button
            onClick={() => {
              clearAuthToken();
              window.location.href = "/auth";
            }}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-20">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-800 bg-slate-950 shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-5xl justify-around px-2 py-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-[56px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl px-3 text-xs font-medium transition-colors",
                  active ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
