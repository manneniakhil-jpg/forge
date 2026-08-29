"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, LocateFixed } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { getCurrentLocation } from "@/lib/geolocation";

export interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
  placeId?: string;
  subtitle?: string;
}

type GeocodeSuggestion = {
  label: string;
  lat?: number;
  lon?: number;
  placeId?: string;
  subtitle?: string;
};

async function fetchSuggestions(
  query: string,
  bias?: { lat: number; lon: number }
): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (bias) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lon));
  }
  const res = await fetch(`/api/geocode?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Search failed");
  return data.results ?? [];
}

async function resolveSuggestion(suggestion: GeocodeSuggestion): Promise<GeocodeHit> {
  if (suggestion.lat != null && suggestion.lon != null) {
    return {
      label: suggestion.subtitle
        ? `${suggestion.label}, ${suggestion.subtitle}`
        : suggestion.label,
      lat: suggestion.lat,
      lon: suggestion.lon,
      placeId: suggestion.placeId,
      subtitle: suggestion.subtitle,
    };
  }

  const res = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestion }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Could not resolve place");
  return data.result;
}

interface PlaceSearchFieldProps {
  id: string;
  label: string;
  hint?: string;
  placeholder: string;
  value: GeocodeHit | null;
  onChange: (hit: GeocodeHit | null) => void;
  onError?: (message: string | null) => void;
  showLocateMe?: boolean;
  /** Bias autocomplete toward user location or map center */
  locationBias?: { lat: number; lon: number } | null;
}

export function PlaceSearchField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
  onError,
  showLocateMe = false,
  locationBias = null,
}: PlaceSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biasRef = useRef(locationBias);
  biasRef.current = locationBias;

  useEffect(() => {
    if (!value) return;
    const display =
      value.label === "Current location"
        ? "Current location"
        : value.subtitle
          ? `${value.label}, ${value.subtitle}`.split(",").slice(0, 3).join(",")
          : value.label.split(",").slice(0, 3).join(",");
    setQuery(display);
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const runSearch = useCallback(
    async (text: string, autoSelectFirst = false): Promise<GeocodeHit | null> => {
      if (text.trim().length < 2) {
        setResults([]);
        return null;
      }
      setSearching(true);
      onError?.(null);
      try {
        const bias = biasRef.current ?? undefined;
        const hits = await fetchSuggestions(text, bias);
        setResults(hits);
        setShowResults(hits.length > 0);

        if (hits.length === 0) {
          onError?.("No places found. Try a city, address, or landmark.");
          return null;
        }

        if (autoSelectFirst) {
          const resolved = await resolveSuggestion(hits[0]);
          onChange(resolved);
          setQuery(
            resolved.label === "Current location"
              ? "Current location"
              : resolved.label.split(",").slice(0, 3).join(",")
          );
          setShowResults(false);
          return resolved;
        }
        return null;
      } catch {
        onError?.("Place search failed. Check your connection and try again.");
        return null;
      } finally {
        setSearching(false);
      }
    },
    [onChange, onError]
  );

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (value && text.trim() !== value.label.split(",").slice(0, 3).join(",").trim()) {
      onChange(null);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 300);
  };

  const selectHit = async (hit: GeocodeSuggestion) => {
    setSearching(true);
    onError?.(null);
    try {
      const resolved = await resolveSuggestion(hit);
      onChange(resolved);
      setQuery(
        hit.subtitle
          ? `${hit.label}, ${hit.subtitle}`.split(",").slice(0, 3).join(",")
          : hit.label.split(",").slice(0, 3).join(",")
      );
      setShowResults(false);
    } catch {
      onError?.("Could not load that place. Try another result.");
    } finally {
      setSearching(false);
    }
  };

  const locateMe = async () => {
    setLocating(true);
    onError?.(null);
    try {
      const point = await getCurrentLocation();
      const hit: GeocodeHit = {
        lat: point.lat,
        lon: point.lon,
        label: "Current location",
      };
      onChange(hit);
      setQuery("Current location");
      setShowResults(false);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not get your location");
    } finally {
      setLocating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="flex gap-2">
        <Input
          id={id}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2 && results.length === 0) {
              void runSearch(query);
            } else if (results.length > 0) {
              setShowResults(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch(query, true);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => runSearch(query)}
          disabled={searching || query.trim().length < 2}
          aria-label={`Search ${label.toLowerCase()}`}
        >
          <Search className="h-4 w-4" />
        </Button>
        {showLocateMe && (
          <Button
            type="button"
            variant="outline"
            onClick={locateMe}
            disabled={locating}
            aria-label="Use my current location"
          >
            <LocateFixed className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} />
          </Button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 shadow-xl"
          role="listbox"
          aria-label={`${label} search results`}
        >
          {results.map((hit) => (
            <li key={hit.placeId ?? `${hit.label}-${hit.lat}-${hit.lon}`}>
              <button
                type="button"
                role="option"
                onClick={() => void selectHit(hit)}
                className="w-full border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-800 last:border-0 min-h-[44px]"
              >
                <span className="block text-sm font-medium text-slate-100">{hit.label}</span>
                {hit.subtitle && (
                  <span className="block text-xs text-slate-400">{hit.subtitle}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {searching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}
    </div>
  );
}
