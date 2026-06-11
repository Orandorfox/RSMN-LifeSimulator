import { NextResponse } from "next/server";
import { issueAccessToken } from "@/lib/auth";
import { adminCookieName, verifyAdminSession } from "@/lib/admin-auth";

function parseCookie(cookieHeader: string, key: string): string | null {
  const items = cookieHeader.split(";").map((i) => i.trim());
  for (const item of items) {
    if (!item) continue;
    const [k, ...rest] = item.split("=");
    if (k === key) return rest.join("=");
  }
  return null;
}

export async function POST(request: Request) {
  const allowDevTools =
    process.env.ADMIN_ENABLE_DEV_TOOLS === "true" ||
    process.env.NODE_ENV !== "production";
  if (!allowDevTools) {
    return NextResponse.json({ ok: false, message: "未启用该功能" }, { status: 403 });
  }
  const cookieHeader = request.headers.get("cookie") || "";
  const session = parseCookie(cookieHeader, adminCookieName());
  if (!session || !verifyAdminSession(session)) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }

  let body: { group?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const group = (body.group || "").trim();
  if (!["1", "2", "3", "4", "5"].includes(group)) {
    return NextResponse.json({ ok: false, message: "分组必须是 1-5" }, { status: 400 });
  }

  const id = `dev-${group}-${Date.now()}`;
  const name = `开发测试用户G${group}`;
  const token = issueAccessToken({ name, id, group }, 2 * 60 * 60);
  return NextResponse.json({ ok: true, participant: { name, id, group, token } });
}
