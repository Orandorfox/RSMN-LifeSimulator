import { NextResponse } from "next/server";
import {
  adminCookieName,
  verifyAdminSession,
} from "@/lib/admin-auth";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = parseCookie(cookieHeader, adminCookieName());
  const payload = session ? verifyAdminSession(session) : null;
  if (!payload) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    username: payload.username,
  });
}

function parseCookie(cookieHeader: string, key: string): string | null {
  const items = cookieHeader.split(";").map((i) => i.trim());
  for (const item of items) {
    if (!item) continue;
    const [k, ...rest] = item.split("=");
    if (k === key) return rest.join("=");
  }
  return null;
}
