import { NextResponse } from "next/server";
import { adminCookieName, verifyAdminSession } from "@/lib/admin-auth";
import {
  createSiteSettingsSnapshot,
  defaultSiteSettings,
  listSiteSettingsSnapshots,
  readSiteSettings,
  rollbackSiteSettingsSnapshot,
  writeSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

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
  const settings = await readSiteSettings();
  const snapshots = await listSiteSettingsSnapshots();
  return NextResponse.json({ ok: true, settings, snapshots });
}

export async function PUT(request: Request) {
  if (!assertAdmin(request)) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  let body: { settings?: Partial<SiteSettings> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }
  const saved = await writeSiteSettings(body.settings || {});
  return NextResponse.json({ ok: true, settings: saved });
}

export async function POST(request: Request) {
  if (!assertAdmin(request)) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  let body: { mode?: string; settings?: Partial<SiteSettings>; note?: string; snapshotId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  if (body.mode === "reset") {
    const saved = await writeSiteSettings(defaultSiteSettings);
    return NextResponse.json({ ok: true, settings: saved });
  }

  if (body.mode === "import") {
    const saved = await writeSiteSettings(body.settings || {});
    return NextResponse.json({ ok: true, settings: saved });
  }

  if (body.mode === "createSnapshot") {
    const snapshot = await createSiteSettingsSnapshot(body.note || "");
    const snapshots = await listSiteSettingsSnapshots();
    return NextResponse.json({ ok: true, snapshot, snapshots });
  }

  if (body.mode === "rollbackSnapshot") {
    const result = await rollbackSiteSettingsSnapshot(body.snapshotId || "");
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message || "回滚失败" }, { status: 400 });
    }
    const snapshots = await listSiteSettingsSnapshots();
    return NextResponse.json({ ok: true, settings: result.settings, snapshots });
  }

  return NextResponse.json({ ok: false, message: "不支持的操作" }, { status: 400 });
}

export async function PATCH(request: Request) {
  if (!assertAdmin(request)) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  const settings = await readSiteSettings();
  return new NextResponse(JSON.stringify(settings, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="site-settings-${Date.now()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
