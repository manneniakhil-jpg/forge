import { jsonOk } from "@/lib/api-helpers";

export async function GET() {
  return jsonOk({ status: "ok" });
}
