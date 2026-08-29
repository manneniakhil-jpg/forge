import { NextRequest } from "next/server";
import { VEHICLE_CATALOG } from "@/lib/seed";
import { jsonOk } from "@/lib/api-helpers";
import type { VehicleKind } from "@ev/domain";

function parseKind(value: string | null): VehicleKind | null {
  if (value === "car" || value === "bike") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  const year = searchParams.get("year");
  const kindParam = parseKind(searchParams.get("kind"));

  if (make && model && year) {
    const entry = VEHICLE_CATALOG.find(
      (v) =>
        v.make.toLowerCase() === make.toLowerCase() &&
        v.model.toLowerCase() === model.toLowerCase() &&
        v.year === parseInt(year, 10) &&
        (!kindParam || v.kind === kindParam)
    );
    if (!entry) return jsonOk({ found: false });
    return jsonOk({ found: true, vehicle: entry });
  }

  const catalog = kindParam ? VEHICLE_CATALOG.filter((v) => v.kind === kindParam) : VEHICLE_CATALOG;
  const makes = [...new Set(catalog.map((v) => v.make))];
  return jsonOk({ catalog, makes, kind: kindParam ?? "all" });
}
