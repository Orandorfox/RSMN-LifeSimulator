import { NextResponse } from "next/server";
import { adminCookieName, verifyAdminSession } from "@/lib/admin-auth";
import { readEnvConfig, writeEnvConfig, type EnvConfig } from "@/lib/env-config";

function parseCookie(cookieHeader: string, key: string): string | null {
  const items = cookieHeader.split(";").map((i) => i.trim());
  for (const item of items) {
    if (!item) continue;
    const [k, ...rest] = item.split("=");
    if (k === key) return rest.join("=");
  }
  return null;
}

function assertAdmin(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = parseCookie(cookieHeader, adminCookieName());
  return Boolean(session && verifyAdminSession(session));
}

export async function GET(request: Request) {
  if (!assertAdmin(request)) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  const envConfig = await readEnvConfig();
  return NextResponse.json({ ok: true, envConfig });
}

export async function PUT(request: Request) {
  if (!assertAdmin(request)) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  let body: { envConfig?: Partial<EnvConfig> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }
  const saved = await writeEnvConfig(body.envConfig || {});
  return NextResponse.json({
    ok: true,
    envConfig: saved,
    message: "已写入 .env.local；请重启服务使配置生效",
  });
}
