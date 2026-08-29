import { NextRequest } from "next/server";
import { VEHICLE_CATALOG } from "@/lib/seed";
import { jsonOk } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  const year = searchParams.get("year");

  if (make && model && year) {
    const entry = VEHICLE_CATALOG.find(
      (v) =>
        v.make.toLowerCase() === make.toLowerCase() &&
        v.model.toLowerCase() === model.toLowerCase() &&
        v.year === parseInt(year)
    );
    if (!entry) return jsonOk({ found: false });
    return jsonOk({ found: true, vehicle: entry });
  }

  const makes = [...new Set(VEHICLE_CATALOG.map((v) => v.make))];
  return jsonOk({ catalog: VEHICLE_CATALOG, makes });
}
