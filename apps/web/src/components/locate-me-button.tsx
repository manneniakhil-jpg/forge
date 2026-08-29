"use client";

import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui";

export function LocateMeButton({
  onClick,
  loading = false,
  variant = "secondary",
  className,
  label = "Locate me",
}: {
  onClick: () => void;
  loading?: boolean;
  variant?: "secondary" | "outline" | "ghost";
  className?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={loading}
      className={className}
      aria-label={label}
    >
      <LocateFixed className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
      {label}
    </Button>
  );
}
