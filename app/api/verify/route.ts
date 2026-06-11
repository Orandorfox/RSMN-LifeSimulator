import { NextResponse } from "next/server";
import { findWhitelistMatch, recordWhitelistEntryAccess } from "@/lib/whitelist";
import { issueAccessToken } from "@/lib/auth";
import { getClientIp } from "@/lib/request";
import { checkRateLimit } from "@/lib/throttle";

const VERIFY_MAX_PER_MINUTE_PER_IP = 20;

/**
 * POST /api/verify
 * Body: { name: string, id: string }
 * 与白名单 CSV 完全匹配则返回分组；否则返回固定错误文案（前端原样展示）。
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);

  const verifyLimit = await checkRateLimit(
    "verify-ip",
    ip,
    VERIFY_MAX_PER_MINUTE_PER_IP,
    60,
  );
  if (!verifyLimit.allowed) {
    return NextResponse.json(
      { ok: false, message: "请求过于频繁，请稍后再试" },
      { status: 429 },
    );
  }

  let body: { name?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求格式错误" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name : "";
  const id = typeof body.id === "string" ? body.id : "";

  const match = await findWhitelistMatch(name, id);
  if (!match) {
    return NextResponse.json({
      ok: false,
      message: "信息错误或不在实验名单内，请联系管理员",
      debug: {
        inputName: name,
        inputId: id,
        // 不再返回完整白名单
        whitelistCount: "hidden"
      }
    });
  }

  // 记录实际进入次数
  const accessResult = await recordWhitelistEntryAccess(match.id);
  if (!accessResult.ok) {
    return NextResponse.json({
      ok: false,
      message: accessResult.message || "已达到允许进入次数上限",
    });
  }

  return NextResponse.json({
    ok: true,
    group: match.group,
    token: issueAccessToken({
      name: match.name,
      id: match.id,
      group: match.group,
    }),
    /** 可选：脱敏回显，便于被试确认 */
    displayName: match.name,
    remainingEntries: accessResult.remaining,
  });
}
