import { NextRequest } from "next/server";
import { validateEmail, validatePassword } from "@ev/domain";
import { registerAccount } from "@/lib/auth";
import { apiError, jsonOk } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  const emailCheck = validateEmail(email ?? "");
  if (!emailCheck.valid) {
    return apiError(emailCheck.code ?? "INVALID_EMAIL_FORMAT", "Invalid email format", 400);
  }

  const passCheck = validatePassword(password ?? "");
  if (!passCheck.valid) {
    return apiError(passCheck.code ?? "PASSWORD_LENGTH_INVALID", "Password must be 12-128 characters", 400);
  }

  const result = await registerAccount(email, password);
  if ("error" in result) {
    return apiError("EMAIL_ALREADY_REGISTERED", "Email already registered", 409);
  }

  return jsonOk({ ownerId: result.ownerId, token: result.token }, 201);
}
