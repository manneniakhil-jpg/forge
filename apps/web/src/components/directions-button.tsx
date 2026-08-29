"use client";

import { Navigation } from "lucide-react";
import { Button } from "@/components/ui";
import { googleMapsDirectionsUrl } from "@/lib/navigation-links";

type Coord = { lat: number; lon: number };

interface DirectionsButtonProps {
  destination: Coord;
  userLocation?: Coord | null;
  variant?: "icon" | "compact";
  className?: string;
}

export function DirectionsButton({
  destination,
  userLocation,
  variant = "icon",
  className,
}: DirectionsButtonProps) {
  const openDirections = () => {
    const url = googleMapsDirectionsUrl(destination, userLocation);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (variant === "compact") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={openDirections}
        aria-label="Get directions in Google Maps"
        className={className}
      >
        <Navigation className="h-4 w-4 shrink-0 text-emerald-400" />
        Directions
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={openDirections}
      aria-label="Get directions in Google Maps"
      title="Directions"
      className={className}
    >
      <Navigation className="h-5 w-5 text-emerald-400" />
    </Button>
  );
}
