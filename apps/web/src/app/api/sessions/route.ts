import { NextRequest } from "next/server";
import { validateEmail } from "@ev/domain";
import { signIn } from "@/lib/auth";
import { apiError, jsonOk } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  if (!validateEmail(email ?? "").valid) {
    return apiError("INVALID_CREDENTIALS", "Invalid credentials", 401);
  }

  const result = await signIn(email, password ?? "");
  if ("error" in result) {
    if (result.error === "TEMPORARILY_LOCKED") {
      return apiError("TEMPORARILY_LOCKED", "Account temporarily locked", 429);
    }
    return apiError("INVALID_CREDENTIALS", "Invalid credentials", 401);
  }

  return jsonOk({ ownerId: result.ownerId, token: result.token });
}
