import { createHash, randomBytes } from "crypto";
import * as argon2 from "argon2";
import { getDb } from "./db";
import { v4 as uuidv4 } from "uuid";

const DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dummySaltValue123456789012$dummyHashValueForTiming123456789012345678901234567890123456789012345678901234567890";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(ownerId: string): string {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  getDb()
    .prepare(
      "INSERT INTO sessions (token_hash, owner_id, issued_at, expires_at) VALUES (?, ?, ?, ?)"
    )
    .run(tokenHash, ownerId, now.toISOString(), expires.toISOString());

  return token;
}

export function validateSession(authHeader: string | null): { ownerId: string } | { error: string } {
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "INVALID_TOKEN" };
  }
  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);
  const row = getDb()
    .prepare("SELECT owner_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { owner_id: string; expires_at: string } | undefined;

  if (!row) return { error: "SESSION_EXPIRED" };
  if (new Date(row.expires_at) < new Date()) return { error: "SESSION_EXPIRED" };
  return { ownerId: row.owner_id };
}

export async function registerAccount(email: string, password: string) {
  const db = getDb();
  const emailLower = email.toLowerCase();
  const existing = db.prepare("SELECT id FROM accounts WHERE email_lower = ?").get(emailLower);
  if (existing) return { error: "EMAIL_ALREADY_REGISTERED" as const };

  const salt = randomBytes(32).toString("hex");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, salt: Buffer.from(salt.slice(0, 16)) });
  const ownerId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO accounts (id, email_lower, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(ownerId, emailLower, email, passwordHash, salt, now);

  const token = createSessionToken(ownerId);
  return { ownerId, token };
}

export async function signIn(email: string, password: string) {
  const db = getDb();
  const emailLower = email.toLowerCase();

  const attempt = db.prepare("SELECT count, locked_until FROM login_attempts WHERE email_lower = ?").get(emailLower) as
    | { count: number; locked_until: string | null }
    | undefined;

  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    return { error: "TEMPORARILY_LOCKED" as const };
  }

  const account = db.prepare("SELECT id, password_hash FROM accounts WHERE email_lower = ?").get(emailLower) as
    | { id: string; password_hash: string }
    | undefined;

  const hashToVerify = account?.password_hash ?? DUMMY_HASH;
  const valid = await argon2.verify(hashToVerify, password);

  if (!account || !valid) {
    const count = (attempt?.count ?? 0) + 1;
    if (count >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.prepare(
        "INSERT INTO login_attempts (email_lower, count, locked_until) VALUES (?, 5, ?) ON CONFLICT(email_lower) DO UPDATE SET count = 5, locked_until = ?"
      ).run(emailLower, lockedUntil, lockedUntil);
      return { error: "TEMPORARILY_LOCKED" as const };
    }
    db.prepare(
      "INSERT INTO login_attempts (email_lower, count) VALUES (?, ?) ON CONFLICT(email_lower) DO UPDATE SET count = ?"
    ).run(emailLower, count, count);
    return { error: "INVALID_CREDENTIALS" as const };
  }

  db.prepare("DELETE FROM login_attempts WHERE email_lower = ?").run(emailLower);
  const token = createSessionToken(account.id);
  return { ownerId: account.id, token };
}

export function getAccount(ownerId: string) {
  return getDb()
    .prepare(
      "SELECT id, email, time_zone, distance_unit, reserve_soc, active_vehicle_id FROM accounts WHERE id = ?"
    )
    .get(ownerId) as {
    id: string;
    email: string;
    time_zone: string;
    distance_unit: "km" | "mi";
    reserve_soc: number;
    active_vehicle_id: string | null;
  } | undefined;
}
