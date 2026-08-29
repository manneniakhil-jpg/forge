import { NextRequest, NextResponse } from "next/server";
import { generateCorrelationId } from "@/lib/utils";

export function apiError(
  code: string,
  message: string,
  status: number,
  fields?: Record<string, string>
) {
  return NextResponse.json(
    { code, message, fields, correlationId: generateCorrelationId() },
    { status }
  );
}

export function getAuthHeader(request: NextRequest): string | null {
  return request.headers.get("authorization");
}

export function jsonOk<T extends object>(data: T, status = 200) {
  return NextResponse.json({ ...data, correlationId: generateCorrelationId() }, { status });
}
