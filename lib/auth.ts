import { createHmac, timingSafeEqual } from "crypto";

type AccessTokenPayload = {
  name: string;
  id: string;
  group: string;
  iat: number;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 20 * 60;

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const rest = padded.length % 4;
  const withPadding = rest ? padded + "=".repeat(4 - rest) : padded;
  return Buffer.from(withPadding, "base64").toString("utf-8");
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("AUTH_TOKEN_SECRET 未配置");
  }
  return secret;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function issueAccessToken(
  input: { name: string; id: string; group: string },
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    name: input.name,
    id: input.id,
    group: input.group,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, getAuthSecret());
  return `${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as AccessTokenPayload;
  } catch {
    return null;
  }

  let expectedSignature = "";
  try {
    expectedSignature = signPayload(encodedPayload, getAuthSecret());
  } catch {
    return null;
  }

  const sigA = Buffer.from(signature, "utf-8");
  const sigB = Buffer.from(expectedSignature, "utf-8");
  if (sigA.length !== sigB.length) return null;
  if (!timingSafeEqual(sigA, sigB)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) return null;
  if (!payload.group || !payload.id || !payload.name) return null;
  return payload;
}
