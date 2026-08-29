"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import { LocateFixed } from "lucide-react";
import type { ChargingStation } from "@ev/domain";
import { googleMapsDirectionsUrl } from "@/lib/navigation-links";
import "leaflet/dist/leaflet.css";

const icon = L.divIcon({
  className: "",
  html: `<div style="background:#10b981;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(37,99,235,.7)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapRecenter({
  lat,
  lon,
  zoom,
}: {
  lat: number;
  lon: number;
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    const targetZoom = zoom ?? map.getZoom();
    if (map.getZoom() === targetZoom) {
      map.setView([lat, lon], targetZoom, { animate: true });
    } else {
      map.flyTo([lat, lon], targetZoom, { duration: 0.6 });
    }
  }, [lat, lon, zoom, map]);
  return null;
}

export function ChargerMap({
  center,
  userLocation,
  mapZoom = 12,
  stations,
  selected,
  onSelect,
  onLocateMe,
  locating = false,
}: {
  center: { lat: number; lon: number };
  userLocation?: { lat: number; lon: number } | null;
  mapZoom?: number;
  stations: Array<ChargingStation & { distanceKm: number }>;
  selected: (ChargingStation & { distanceKm: number }) | null;
  onSelect: (s: ChargingStation & { distanceKm: number }) => void;
  onLocateMe?: () => void;
  locating?: boolean;
}) {
  return (
    <div className="relative h-[400px] overflow-hidden rounded-2xl border border-slate-700">
      {onLocateMe && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLocateMe();
          }}
          disabled={locating}
          className="absolute right-3 top-3 z-[1000] flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900/95 px-3 py-2 text-sm font-medium text-slate-100 shadow-lg backdrop-blur hover:bg-slate-800 disabled:opacity-60"
          aria-label="Locate me"
        >
          <LocateFixed
            className={`h-[18px] w-[18px] ${locating ? "animate-pulse text-emerald-400" : "text-emerald-400"}`}
          />
          <span className="hidden sm:inline">{locating ? "Locating…" : "Locate me"}</span>
        </button>
      )}
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={mapZoom}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRecenter lat={center.lat} lon={center.lon} zoom={mapZoom} />
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lon]} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {stations.map((s) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(s) }}
          >
            <Popup>
              <strong>{s.operatorName}</strong>
              <br />
              {s.distanceKm.toFixed(1)} km
              <br />
              <a
                href={googleMapsDirectionsUrl(
                  { lat: s.latitude, lon: s.longitude },
                  userLocation
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 underline"
              >
                Get directions
              </a>
            </Popup>
          </Marker>
        ))}
        {selected && (
          <MapRecenter lat={selected.latitude} lon={selected.longitude} zoom={15} />
        )}
      </MapContainer>
    </div>
  );
}