import { NextResponse } from "next/server";
import {
  adminCookieName,
  issueAdminSession,
  verifyAdminLogin,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求格式错误" },
      { status: 400 },
    );
  }

  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!verifyAdminLogin(username, password)) {
    return NextResponse.json(
      { ok: false, message: "账号或密码错误" },
      { status: 401 },
    );
  }

  const token = issueAdminSession(username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
