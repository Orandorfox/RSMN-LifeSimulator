import { createHmac, timingSafeEqual } from "crypto";

type AdminSessionPayload = {
  username: string;
  iat: number;
  exp: number;
};

const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_TTL_SECONDS = 8 * 60 * 60;

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

function getAdminSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("AUTH_TOKEN_SECRET 未配置");
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getAdminSecret())
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getAdminCreds() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  return { username, password };
}

export function adminCookieName(): string {
  return ADMIN_COOKIE_NAME;
}

export function verifyAdminLogin(username: string, password: string): boolean {
  const expected = getAdminCreds();
  if (!expected.username || !expected.password) return false;
  return username === expected.username && password === expected.password;
}

export function issueAdminSession(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    username,
    iat: now,
    exp: now + ADMIN_TTL_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyAdminSession(token: string): AdminSessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as AdminSessionPayload;
  } catch {
    return null;
  }

  const expected = sign(encoded);
  const a = Buffer.from(signature, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) return null;
  return payload;
}
