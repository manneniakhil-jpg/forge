"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { ChargingStation } from "@ev/domain";
import "leaflet/dist/leaflet.css";

const icon = L.divIcon({
  className: "",
  html: `<div style="background:#10b981;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);
  return null;
}

export function ChargerMap({
  center,
  stations,
  selected,
  onSelect,
}: {
  center: { lat: number; lon: number };
  stations: Array<ChargingStation & { distanceKm: number }>;
  selected: (ChargingStation & { distanceKm: number }) | null;
  onSelect: (s: ChargingStation & { distanceKm: number }) => void;
}) {
  return (
    <div className="h-[400px] overflow-hidden rounded-2xl border border-slate-700">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={center.lat} lon={center.lon} />
        <Marker position={[center.lat, center.lon]} />
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
            </Popup>
          </Marker>
        ))}
        {selected && (
          <Recenter lat={selected.latitude} lon={selected.longitude} />
        )}
      </MapContainer>
    </div>
  );
}
