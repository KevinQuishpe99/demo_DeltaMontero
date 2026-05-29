import type { NextRequest } from "next/server";

export const AUTH_COOKIE_NAME = "cora_auth";

const SESSION_PAYLOAD = "cora_session_v1";

/** Lectura dinámica para que middleware (Edge) use env en runtime, no en build. */
function readEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function sessionSecret(): string {
  return (
    readEnv("AUTH_SESSION_SECRET") ||
    readEnv("DB_PASSWORD") ||
    "deltamontero-dev-session"
  );
}

/** Comparación en tiempo constante sin Node.js crypto. */
function timingSafeEqualUtf8(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Credenciales desde AUTH_USER / AUTH_PASSWORD en .env / Vercel. */
export function getAuthCredentials(): { user: string; password: string } {
  const user = readEnv("AUTH_USER");
  const password = readEnv("AUTH_PASSWORD");
  return {
    user: (user || "cora").toLowerCase(),
    password: password ?? "CoraDemo2024!",
  };
}

/** Iniciales para avatar a partir del usuario configurado. */
export function getAuthDisplayInitials(username: string): string {
  const local = username.split("@")[0]?.trim() || username.trim();
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "U";
}

export function verifyAuthCredentials(
  username: string,
  password: string
): boolean {
  const expected = getAuthCredentials();
  const user = username.trim().toLowerCase();
  if (user !== expected.user) return false;
  return timingSafeEqualUtf8(password, expected.password);
}

export async function createSessionToken(): Promise<string> {
  const sig = await hmacSha256Hex(sessionSecret(), SESSION_PAYLOAD);
  return `${SESSION_PAYLOAD}.${sig}`;
}

export async function isValidSessionToken(
  token: string | undefined
): Promise<boolean> {
  if (!token?.trim()) return false;
  const expected = await createSessionToken();
  return timingSafeEqualUtf8(token, expected);
}

export function readAuthCookie(request: NextRequest): string | undefined {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value;
}

export async function isRequestAuthenticated(
  request: NextRequest
): Promise<boolean> {
  return isValidSessionToken(readAuthCookie(request));
}
