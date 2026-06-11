import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { verifyAccessToken } from "@/lib/auth";
import {
  acquireGenerateSlot,
  checkRateLimit,
  releaseGenerateSlot,
} from "@/lib/throttle";
import { readSiteSettings } from "@/lib/site-settings";

// 研究人员联系邮箱
const RESEARCH_CONTACT_EMAIL = 'xxx@xx.com';

const USER_FACING_ERROR = `系统错误，请联系研究人员，邮箱 ${RESEARCH_CONTACT_EMAIL}`;
const UPSTREAM_TIMEOUT_MS = 40_000;
const MAX_GENERATE_IN_FLIGHT = 60;
const GENERATE_MAX_PER_MINUTE_PER_IP = 30;
const GENERATE_MAX_PER_MINUTE_PER_USER = 6;

const MULTIMODAL_GENERATION_PATH =
  "/services/aigc/multimodal-generation/generation";

const isDev = process.env.NODE_ENV === "development";

/**
 * 根据分组获取环境变量
 */
function getEnvForGroup(key: string, group?: string): string | undefined {
  if (group) {
    const groupKey = key + '_' + group;
    if (process.env[groupKey]) {
      return process.env[groupKey];
    }
  }
  return process.env[key];
}

async function getImageCountForGroup(group?: string): Promise<number> {
  try {
    const settings = await readSiteSettings();
    const value =
      (group && settings.generate?.imageCountByGroup?.[group as "1" | "2" | "3" | "4" | "5"]) ||
      settings.generate?.imageCountByGroup?.default ||
      1;
    return value === 2 ? 2 : 1;
  } catch {
    if (group === "2" || group === "3") return 2;
    return 1;
  }
}

type DashScopeMultimodalResponse = {
  status_code?: number;
  code?: string;
  message?: string;
  request_id?: string;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; text?: string }> | unknown;
      };
    }>;
    results?: Array<{ url?: string; image?: string }>;
  };
};

function devDebug(payload: Record<string, unknown>) {
  return isDev ? { _debug: payload } : {};
}

function failResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      ok: false,
      message: USER_FACING_ERROR,
      ...devDebug({ code, ...extra }),
    },
    { status },
  );
}

/**
 * 从百炼「千问-图像」等响应中解析输出图 URL（兼容多种嵌套结构）。
 */
function extractOutputImageUrls(data: unknown): string[] {
  const urls: string[] = [];
  const parsed = data as Record<string, unknown>;
  const output = parsed.output as Record<string, unknown> | undefined;
  if (!output) return urls;

  const choices = output.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined;
  const msg0 = choices?.[0]?.message;
  const content = msg0?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && "image" in item) {
        const im = (item as { image?: string }).image;
        if (typeof im === "string") urls.push(im);
      }
    }
  }

  const results = output.results as unknown[] | undefined;
  if (Array.isArray(results)) {
    for (const r of results) {
      if (r && typeof r === "object") {
        const o = r as { url?: string; image?: string };
        const u = typeof o.url === "string" ? o.url : o.image;
        if (typeof u === "string") urls.push(u);
      }
    }
  }

  return [...new Set(urls)];
}

function buildMultimodalRequestUrl(): string {
  const baseRaw =
    process.env.DASHSCOPE_HTTP_API_BASE ||
    "https://dashscope.aliyuncs.com/api/v1";
  const base = baseRaw.replace(/\/$/, "");
  if (process.env.DASHSCOPE_MULTIMODAL_URL) {
    return process.env.DASHSCOPE_MULTIMODAL_URL;
  }
  return `${base}${MULTIMODAL_GENERATION_PATH}`;
}

/**
 * POST /api/generate — 百炼多模态图像（与 Python MultiModalConversation 对应）
 *
 * 失败时生产环境只返回统一文案；开发环境额外返回 _debug 便于排查（不含密钥）。
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipLimit = await checkRateLimit(
    "generate-ip",
    ip,
    GENERATE_MAX_PER_MINUTE_PER_IP,
    60,
  );
  if (!ipLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: "请求过于频繁，请稍后再试",
      },
      { status: 429 },
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const tokenPayload = verifyAccessToken(token);
  if (!tokenPayload) {
    return failResponse(401, "UNAUTHORIZED_OR_EXPIRED_TOKEN");
  }

  const userLimit = await checkRateLimit(
    "generate-user",
    `${tokenPayload.group}:${tokenPayload.id}`,
    GENERATE_MAX_PER_MINUTE_PER_USER,
    60,
  );
  if (!userLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: "生成请求过于频繁，请稍后再试",
      },
      { status: 429 },
    );
  }

  let body: { imageBase64?: string; mimeType?: string; group?: string };
  try {
    body = await request.json();
  } catch {
    return failResponse(400, "INVALID_JSON_BODY");
  }

  // 根据分组获取对应的API密钥（必须指定分组）
  if (body.group !== tokenPayload.group) {
    return failResponse(403, "GROUP_MISMATCH");
  }

  const apiKey = getEnvForGroup("DASHSCOPE_API_KEY", body.group);
  if (!apiKey) {
    console.error("[generate] 未找到分组", body.group, "的API密钥配置");
    return failResponse(500, "MISSING_API_KEY_CONFIG", {
      hint: "请在 .env.local 中设置 DASHSCOPE_API_KEY_" + body.group + "=sk-...",
    });
  }

  const raw = body.imageBase64;
  if (typeof raw !== "string" || !raw.trim()) {
    return failResponse(400, "MISSING_IMAGE");
  }

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  const base64Data = raw.includes(",") ? raw.split(",")[1]! : raw;
  
  // 检查图片大小
  const imageSize = Math.ceil((base64Data.length * 3) / 4);
  if (imageSize > MAX_IMAGE_SIZE) {
    return failResponse(400, "IMAGE_TOO_LARGE", {
      hint: `图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
    });
  }

  const mime =
    typeof body.mimeType === "string" && body.mimeType
      ? body.mimeType
      : "image/jpeg";
  const dataUrl = `data:${mime};base64,${base64Data}`;

  if (isDev) {
    const approxBytes = Math.ceil((base64Data.length * 3) / 4);
    console.log(
      "[generate] 入参约",
      (approxBytes / 1024).toFixed(1),
      "KB（解码后估算）",
    );
  }

  // 根据分组获取对应的模型（必须指定分组，没有默认模型）
  const model = getEnvForGroup("DASHSCOPE_IMAGE_MODEL", body.group);
  if (!model) {
    console.error("[generate] 未找到分组", body.group, "的模型配置");
    return failResponse(500, "MISSING_MODEL_CONFIG", {
      hint: "请在 .env.local 中设置 DASHSCOPE_IMAGE_MODEL_" + body.group,
    });
  }

  // 根据分组获取对应的提示词（必须指定分组，没有默认提示词）
  const prompt = getEnvForGroup("DASHSCOPE_IMAGE_PROMPT", body.group);
  if (!prompt) {
    console.error("[generate] 未找到分组", body.group, "的提示词配置");
    return failResponse(500, "MISSING_PROMPT_CONFIG", {
      hint: "请在 .env.local 中设置 DASHSCOPE_IMAGE_PROMPT_" + body.group,
    });
  }

  // 按实验分组控制图片数量：2/3 组返回 2 张，其余组返回 1 张
  const n = await getImageCountForGroup(body.group);

  const watermark = process.env.DASHSCOPE_WATERMARK === "true";
  const negativePrompt =
    process.env.DASHSCOPE_NEGATIVE_PROMPT !== undefined
      ? process.env.DASHSCOPE_NEGATIVE_PROMPT
      : " ";
  const promptExtend = process.env.DASHSCOPE_PROMPT_EXTEND !== "false";

  const parameters: Record<string, unknown> = {
    n,
    watermark,
    negative_prompt: negativePrompt,
    prompt_extend: promptExtend,
    /** 与 Python SDK stream=False 对齐，避免部分网关默认流式行为异常 */
    stream: false,
  };
  if (process.env.DASHSCOPE_IMAGE_SIZE?.trim()) {
    parameters.size = process.env.DASHSCOPE_IMAGE_SIZE.trim();
  }

  if (isDev && body.group) {
    console.log("[generate] 实验分组:", body.group);
  }

  const url = buildMultimodalRequestUrl();

  const payload = {
    model,
    input: {
      messages: [
        {
          role: "user",
          content: [{ image: dataUrl }, { text: prompt }],
        },
      ],
    },
    parameters,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const hasSlot = await acquireGenerateSlot(MAX_GENERATE_IN_FLIGHT);
  if (!hasSlot) {
    clearTimeout(timer);
    return NextResponse.json(
      {
        ok: false,
        message: "当前访问量较大，请稍后再试",
      },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await upstream.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("[generate] 响应非 JSON:", text.slice(0, 800));
      return failResponse(502, "UPSTREAM_NOT_JSON", {
        httpStatus: upstream.status,
        preview: text.slice(0, 200),
      });
    }

    const parsed = json as DashScopeMultimodalResponse;

    if (!upstream.ok) {
      console.error(
        "[generate] HTTP 错误:",
        upstream.status,
        parsed?.code,
        parsed?.message,
        "request_id:",
        parsed?.request_id,
      );
      return failResponse(502, "UPSTREAM_HTTP_ERROR", {
        httpStatus: upstream.status,
        dashscopeCode: parsed?.code,
        dashscopeMessage: parsed?.message,
        requestId: parsed?.request_id,
      });
    }

    if (
      parsed.status_code !== undefined &&
      parsed.status_code !== 200
    ) {
      console.error(
        "[generate] 业务 status_code:",
        parsed.status_code,
        parsed.code,
        parsed.message,
      );
      return failResponse(502, "DASHSCOPE_STATUS_NOT_200", {
        status_code: parsed.status_code,
        dashscopeCode: parsed.code,
        dashscopeMessage: parsed.message,
        requestId: parsed.request_id,
      });
    }

    if (parsed.code) {
      console.error(
        "[generate] 业务 code:",
        parsed.code,
        parsed.message,
        parsed.request_id,
      );
      return failResponse(502, "DASHSCOPE_BUSINESS_ERROR", {
        dashscopeCode: parsed.code,
        dashscopeMessage: parsed.message,
        requestId: parsed.request_id,
      });
    }

    const urls = extractOutputImageUrls(json);
    const first = urls[0];
    if (!first) {
      const outStr = JSON.stringify(parsed.output ?? {}).slice(0, 1200);
      console.error(
        "[generate] 响应中无图片 URL，request_id:",
        parsed.request_id,
        outStr,
      );
      return failResponse(502, "NO_IMAGE_IN_RESPONSE", {
        requestId: parsed.request_id,
        outputPreview: outStr,
        hint: "请核对控制台模型名、地域与账户是否开通该图像模型；或百炼返回结构与解析不一致",
      });
    }

    return NextResponse.json({
      ok: true,
      imageUrl: first,
      imageUrls: urls,
    });
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("[generate] 请求异常:", aborted ? "timeout" : e);
    return failResponse(aborted ? 504 : 502, aborted ? "TIMEOUT_40S" : "FETCH_THROW", {
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await releaseGenerateSlot();
    clearTimeout(timer);
  }
}
