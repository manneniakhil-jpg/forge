"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";

export interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
}

async function searchPlaces(query: string): Promise<GeocodeHit[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Search failed");
  return data.results ?? [];
}

interface PlaceSearchFieldProps {
  id: string;
  label: string;
  hint?: string;
  placeholder: string;
  value: GeocodeHit | null;
  onChange: (hit: GeocodeHit | null) => void;
  onError?: (message: string | null) => void;
  quickPicks?: string[];
  quickPicksLabel?: string;
}

export function PlaceSearchField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
  onError,
  quickPicks,
  quickPicksLabel,
}: PlaceSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value && !query) {
      setQuery(value.label.split(",").slice(0, 3).join(","));
    }
  }, [value, query]);

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
        const hits = await searchPlaces(text);
        setResults(hits);
        setShowResults(true);
        if (hits.length === 0) {
          onChange(null);
          onError?.("No places found. Try a city, zip code, or full address.");
          return null;
        }
        if (autoSelectFirst) {
          onChange(hits[0]);
          setQuery(hits[0].label.split(",").slice(0, 2).join(","));
          setShowResults(false);
          return hits[0];
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
    onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 450);
  };

  const selectHit = (hit: GeocodeHit) => {
    onChange(hit);
    setQuery(hit.label.split(",").slice(0, 3).join(","));
    setShowResults(false);
    onError?.(null);
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
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(query, true);
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
      </div>

      {showResults && results.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 shadow-xl"
          role="listbox"
          aria-label={`${label} search results`}
        >
          {results.map((hit) => (
            <li key={`${hit.lat}-${hit.lon}-${hit.label}`}>
              <button
                type="button"
                role="option"
                onClick={() => selectHit(hit)}
                className="w-full border-b border-slate-800 px-4 py-3 text-left text-sm hover:bg-slate-800 last:border-0 min-h-[44px]"
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {searching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}

      {value && !showResults && (
        <p className="mt-2 line-clamp-2 text-sm text-emerald-300/90">Selected: {value.label}</p>
      )}

      {quickPicks && quickPicks.length > 0 && (
        <div className="mt-3">
          {quickPicksLabel && (
            <p className="mb-2 text-xs font-medium text-slate-500">{quickPicksLabel}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {quickPicks.map((place) => (
              <button
                key={place}
                type="button"
                onClick={() => {
                  setQuery(place);
                  runSearch(place, true);
                }}
                className="min-h-[32px] rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-emerald-600 hover:text-emerald-300"
              >
                {place.split(",")[0]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
