import { NextResponse } from "next/server";
import { adminCookieName } from "@/lib/admin-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
