import { NextResponse } from "next/server";
import { adminCookieName, verifyAdminSession } from "@/lib/admin-auth";
import {
  addWhitelistEntry,
  batchRemoveWhitelistEntries,
  batchUpdateWhitelistGroup,
  batchUpdateWhitelistAllowedEntries,
  importWhitelistFromCsvText,
  listWhitelistEntries,
  listAuditLogs,

  removeWhitelistEntry,
  updateWhitelistEntry,
  updateWhitelistEntryAllowedEntries,
} from "@/lib/whitelist";

function parseCookie(cookieHeader: string, key: string): string | null {
  const items = cookieHeader.split(";").map((i) => i.trim());
  for (const item of items) {
    if (!item) continue;
    const [k, ...rest] = item.split("=");
    if (k === key) return rest.join("=");
  }
  return null;
}

function getAdminUser(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const session = parseCookie(cookieHeader, adminCookieName());
  const payload = session ? verifyAdminSession(session) : null;
  return payload?.username || null;
}

export async function GET(request: Request) {
  const adminUser = getAdminUser(request);
  if (!adminUser) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  const list = await listWhitelistEntries();
  const audits = await listAuditLogs(30);
  return NextResponse.json({ ok: true, entries: list, audits });
}

export async function POST(request: Request) {
  const adminUser = getAdminUser(request);
  if (!adminUser) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  let body: { name?: string; id?: string; group?: string; csvText?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求格式错误" },
      { status: 400 },
    );
  }

  if (body.mode === "import") {
    const result = await importWhitelistFromCsvText(body.csvText || "", adminUser);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message || "导入失败" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      imported: { added: result.added, skipped: result.skipped },
    });
  }

  const result = await addWhitelistEntry(
    {
      name: body.name || "",
      id: body.id || "",
      group: body.group || "",
      allowedEntries: 2,
      actualEntries: 0,
      entryLogs: [],
    },
    adminUser,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message || "新增失败" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const adminUser = getAdminUser(request);
  if (!adminUser) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  let body: { id?: string; ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求格式错误" },
      { status: 400 },
    );
  }
  if (Array.isArray(body.ids)) {
    const result = await batchRemoveWhitelistEntries(body.ids, adminUser);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message || "批量删除失败" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      deleted: { removed: result.removed, skipped: result.skipped },
    });
  }

  const result = await removeWhitelistEntry(body.id || "", adminUser);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message || "删除失败" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const adminUser = getAdminUser(request);
  if (!adminUser) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }
  let body: { id?: string; name?: string; group?: string; mode?: string; ids?: string[]; allowedEntries?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求格式错误" },
      { status: 400 },
    );
  }

  if (body.mode === "batchUpdateGroup") {
    const result = await batchUpdateWhitelistGroup(body.ids || [], body.group || "", adminUser);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message || "批量改组失败" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      updated: { changed: result.updated, skipped: result.skipped },
    });
  }

  if (body.mode === "updateAllowedEntries") {
    const result = await updateWhitelistEntryAllowedEntries(
      body.id || "",
      Number(body.allowedEntries) || 2,
      adminUser,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message || "更新允许进入次数失败" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.mode === "batchUpdateAllowedEntries") {
    const result = await batchUpdateWhitelistAllowedEntries(
      body.ids || [],
      Number(body.allowedEntries) || 2,
      adminUser,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message || "批量更新允许进入次数失败" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      updated: { changed: result.updated, skipped: result.skipped },
    });
  }

  const result = await updateWhitelistEntry(
    body.id || "",
    { name: body.name, group: body.group },
    adminUser,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message || "更新失败" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const adminUser = getAdminUser(request);
  if (!adminUser) {
    return NextResponse.json({ ok: false, message: "未授权" }, { status: 401 });
  }

  const list = await listAuditLogs(200);
  const lines = [
    "时间,管理员,动作,编号,详情",
    ...list.map((a) =>
      [
        csvEscape(a.createdAt),
        csvEscape(a.actor),
        csvEscape(a.action),
        csvEscape(a.targetId),
        csvEscape(a.detail),
      ].join(","),
    ),
  ];
  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="admin-audit-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}
