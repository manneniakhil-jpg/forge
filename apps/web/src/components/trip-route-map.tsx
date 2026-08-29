"use client";

import { MapContainer, Polyline, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TripPlan } from "@ev/domain";

const originIcon = L.divIcon({
  className: "",
  html: `<div style="background:#3b82f6;width:12px;height:12px;border-radius:50%;border:2px solid white"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const destIcon = L.divIcon({
  className: "",
  html: `<div style="background:#ef4444;width:12px;height:12px;border-radius:50%;border:2px solid white"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const stopIcon = L.divIcon({
  className: "",
  html: `<div style="background:#10b981;width:10px;height:10px;border-radius:50%;border:2px solid white"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

export function TripRouteMap({ plan }: { plan: TripPlan }) {
  const coords = plan.routeCoordinates?.map(([lat, lon]) => [lat, lon] as [number, number]) ?? [
    [plan.origin.lat, plan.origin.lon],
    [plan.destination.lat, plan.destination.lon],
  ];

  const center = coords[Math.floor(coords.length / 2)] ?? [plan.origin.lat, plan.origin.lon];

  return (
    <div className="h-[280px] overflow-hidden rounded-2xl border border-slate-700">
      <MapContainer center={center} zoom={7} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={coords} pathOptions={{ color: "#10b981", weight: 4, opacity: 0.85 }} />
        <Marker position={[plan.origin.lat, plan.origin.lon]} icon={originIcon}>
          <Popup>Start</Popup>
        </Marker>
        <Marker position={[plan.destination.lat, plan.destination.lon]} icon={destIcon}>
          <Popup>Destination</Popup>
        </Marker>
        {plan.chargeStops.map((stop, i) => (
          <Marker key={stop.stationId} position={[stop.latitude, stop.longitude]} icon={stopIcon}>
            <Popup>Charge stop {i + 1}: {stop.stationName}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
