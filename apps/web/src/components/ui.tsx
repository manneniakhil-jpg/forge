import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50 min-h-[44px] min-w-[44px]",
        {
          "bg-emerald-600 text-white hover:bg-emerald-700 px-5 py-2.5": variant === "default",
          "bg-slate-800 text-slate-100 hover:bg-slate-700 px-5 py-2.5": variant === "secondary",
          "border border-slate-600 bg-transparent hover:bg-slate-800 px-5 py-2.5": variant === "outline",
          "hover:bg-slate-800 px-3 py-2": variant === "ghost",
          "bg-red-600 text-white hover:bg-red-700 px-5 py-2.5": variant === "destructive",
          "h-11 px-5": size === "default",
          "h-9 px-3 text-sm": size === "sm",
          "h-12 px-6 text-lg": size === "lg",
          "h-11 w-11": size === "icon",
        },
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-base text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[44px]",
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-xl backdrop-blur",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-slate-300 mb-1.5 block", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        {
          "bg-slate-700 text-slate-200": variant === "default",
          "bg-emerald-900/60 text-emerald-300": variant === "success",
          "bg-amber-900/60 text-amber-300": variant === "warning",
          "bg-red-900/60 text-red-300": variant === "danger",
        },
        className
      )}
      {...props}
    />
  );
}
