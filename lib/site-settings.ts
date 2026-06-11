import fs from "fs/promises";
import path from "path";

export type SiteSettings = {
  theme: {
    bgColor: string;
    textColor: string;
    cardColor: string;
    borderColor: string;
    primaryColor: string;
    primaryTextColor: string;
    baseFontSizePx: number;
    baseFontWeight: number;
  };
  content: {
    siteName: string;
    homeTitle: string;
    homeSubtitle: string;
    consentTitle: string;
    contactEmail: string;
    footerText: string;
    cameraHint: string;
    loadingTitle: string;
    loadingSubtitle: string;
    cameraGuideTitle: string;
    cameraGuideText: string;
    cameraGuideImage: string;
    consentIntro: string;
    consentItemsText: string;
    consentAgreementText: string;
    noticeContactPrefix: string;
    noticeAgreeHint: string;
    experimentExitText: string;
    experimentNextButtonText: string;
    surveyPageTitle: string;
    surveyExitText: string;
    surveyUrls: {
      "1": string;
      "2": string;
      "3": string;
      "4": string;
      "5": string;
      default: string;
    };
    groupGuideTexts: {
      "1": string;
      "2": string;
      "3": string;
      "4": string;
      "5": string;
      default: string;
    };
    resultLabelsByGroup: {
      "1": { selfie: string; generated1: string; generated2: string; tail: string };
      "2": { selfie: string; generated1: string; generated2: string; tail: string };
      "3": { selfie: string; generated1: string; generated2: string; tail: string };
      "4": { selfie: string; generated1: string; generated2: string; tail: string };
      "5": { selfie: string; generated1: string; generated2: string; tail: string };
      default: { selfie: string; generated1: string; generated2: string; tail: string };
    };
    defaultBeforeSurveyNoticeTitle: string;
    defaultBeforeSurveyNoticeBody: string;
  };
  flow: {
    notices: Array<{
      id: string;
      placement:
        | "beforeCamera"
        | "beforeResult"
        | "beforeSurvey"
        | "beforeHomeLogin";
      title: string;
      body: string;
      enabled: boolean;
    }>;
  };
  generate: {
    imageCountByGroup: {
      "1": 1 | 2;
      "2": 1 | 2;
      "3": 1 | 2;
      "4": 1 | 2;
      "5": 1 | 2;
      default: 1 | 2;
    };
  };
};

const SETTINGS_FILE = "site-settings.json";
const SNAPSHOTS_FILE = "site-settings-snapshots.json";
const REDIS_KEY = "site:settings";
const REDIS_SNAPSHOTS_KEY = "site:settings:snapshots";
const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

export const defaultSiteSettings: SiteSettings = {
  theme: {
    bgColor: "#020617",
    textColor: "#f1f5f9",
    cardColor: "#0f172acc",
    borderColor: "#334155",
    primaryColor: "#059669",
    primaryTextColor: "#ffffff",
    baseFontSizePx: 16,
    baseFontWeight: 400,
  },
  content: {
    siteName: "人生模拟器",
    homeTitle: "人生模拟器",
    homeSubtitle: "请输入姓名与学号",
    consentTitle: "知情同意书",
    contactEmail: "***",
    footerText: "本应用仅用于学术研究。遇到问题请联系研究人员。",
    cameraHint: "请授予前置摄像头权限，点击拍照按钮开始拍照。",
    loadingTitle: "请耐心等待图片生成...",
    loadingSubtitle: "请勿关闭页面，预计不超过10秒，生成完毕后请按要求观察图片",
    cameraGuideTitle: "拍照提示",
    cameraGuideText: "接下来您将进入到拍照环节，请您不要遮挡脸部，也不要佩戴帽子或墨镜，确保背景纯净且没有其他人入镜，如下图所示：",
    cameraGuideImage: "shotguide.jpg",
    consentIntro: "欢迎您参加本次研究，在开始前请您先阅读以下内容：",
    consentItemsText:
      "您的年龄需要≥18周岁（即2008年1月1日以前出生）。\n" +
      "本研究没有潜在危险。研究是匿名进行的，您提供的信息将会被完全保密，仅用作学术用途。您的隐私权将得到最大限度的保护。\n" +
      "本研究可能会以自拍等形式采集您的人脸照片。如您不同意，请您退出作答。同时，您也有权利在研究的任何一个步骤退出。\n" +
      "本研究已获得伦理委员会的伦理批准（编号***）。",
    consentAgreementText: "若您同意上述内容，请点击下一步。",
    noticeContactPrefix: "若您有任何问题，请联系研究者，邮箱：",
    noticeAgreeHint: "若您同意上述内容，请点击下一步。",
    experimentExitText: "退出",
    experimentNextButtonText: "下一步",
    surveyPageTitle: "问卷填写",
    surveyExitText: "退出",
    surveyUrls: {
      "1": "***",
      "2": "***",
      "3": "***",
      "4": "***",
      "5": "***",
      default: "***",
    },
    groupGuideTexts: {
      "1": "请观看图片5秒钟，观察照片中的细节，并截图保存。",
      "2": "请依次观看两张图片各5秒钟，观察人物、场所、活动与心情等细节，并截图保存。",
      "3": "请依次观看两张图片各5秒钟，重点比较两张图中的状态差异，并截图保存。",
      "4": "请观看图片5秒钟，观察照片中的的人物、场所、活动、心情等细节，并截图保存。",
      "5": "请观看图片5秒钟，观察照片中的的人物、场所、活动、心情等细节，并截图保存。",
      default: "请仔细观察生成的照片，并在完成上述要求后进行下一步。",
    },
    resultLabelsByGroup: {
      "1": {
        selfie: "这是你的自拍照片",
        generated1: "这是你70岁时的样子",
        generated2: "这是你70岁时的处境",
        tail: "请观看图片5秒钟，观察照片中的细节，并截图保存。",
      },
      "2": {
        selfie: "这是你的自拍照片",
        generated1: "这是你70岁时的样子",
        generated2: "这是你70岁时的处境",
        tail: "请依次观看两张图片各5秒钟，观察人物、场所、活动与心情等细节，并截图保存。",
      },
      "3": {
        selfie: "这是你的自拍照片",
        generated1: "这是你70岁时的样子",
        generated2: "这是你70岁时的处境",
        tail: "请依次观看两张图片各5秒钟，重点比较两张图中的状态差异，并截图保存。",
      },
      "4": {
        selfie: "这是你的自拍照片",
        generated1: "这是你当前的处境",
        generated2: "这是你当前的处境",
        tail: "请观看图片5秒钟，观察照片中的的人物、场所、活动、心情等细节，并截图保存。",
      },
      "5": {
        selfie: "这是你的自拍照片",
        generated1: "这是你当前的处境",
        generated2: "这是你当前的处境",
        tail: "请观看图片5秒钟，观察照片中的的人物、场所、活动、心情等细节，并截图保存。",
      },
      default: {
        selfie: "这是你的自拍照片",
        generated1: "生成照片1",
        generated2: "生成照片2",
        tail: "请仔细观察生成的照片，并在完成上述要求后进行下一步。",
      },
    },
    defaultBeforeSurveyNoticeTitle: "注意",
    defaultBeforeSurveyNoticeBody:
      "1. 接下来请您带着您刚才观看图片的感受，完成一项简短的问卷调查。\n" +
      "2. 在问卷调查的过程中，请您不要一味填写正向答案，正向的不一定会被采纳，只有真实的想法才会被采纳！\n" +
      "3. 因研究需要，本问卷可能会以主动上传等形式采集您的人脸照片。如您不同意，请您退出作答。同时，您也有权利在研究的任何一个步骤退出。\n" +
      "4. 本研究已获得伦理委员会的伦理批准（编号***）。",
  },
  flow: {
    notices: [],
  },
  generate: {
    imageCountByGroup: {
      "1": 1,
      "2": 2,
      "3": 2,
      "4": 1,
      "5": 1,
      default: 1,
    },
  },
};

async function redisCommand(parts: string[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const endpoint = `${url.replace(/\/$/, "")}/${parts.map((p) => encodeURIComponent(p)).join("/")}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis command failed: ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

function mergeSettings(input: Partial<SiteSettings> | null | undefined): SiteSettings {
  const incoming = input || {};
  return {
    theme: {
      ...defaultSiteSettings.theme,
      ...(incoming.theme || {}),
      baseFontSizePx: Number(incoming.theme?.baseFontSizePx || defaultSiteSettings.theme.baseFontSizePx),
      baseFontWeight: Number(incoming.theme?.baseFontWeight || defaultSiteSettings.theme.baseFontWeight),
    },
    content: {
      ...defaultSiteSettings.content,
      ...(incoming.content || {}),
      surveyUrls: {
        ...defaultSiteSettings.content.surveyUrls,
        ...((incoming.content?.surveyUrls as Partial<SiteSettings["content"]["surveyUrls"]> | undefined) || {}),
      },
      groupGuideTexts: {
        ...defaultSiteSettings.content.groupGuideTexts,
        ...((incoming.content?.groupGuideTexts as Partial<SiteSettings["content"]["groupGuideTexts"]> | undefined) || {}),
      },
      resultLabelsByGroup: {
        ...defaultSiteSettings.content.resultLabelsByGroup,
        ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined) || {}),
        "1": {
          ...defaultSiteSettings.content.resultLabelsByGroup["1"],
          ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined)?.["1"] || {}),
        },
        "2": {
          ...defaultSiteSettings.content.resultLabelsByGroup["2"],
          ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined)?.["2"] || {}),
        },
        "3": {
          ...defaultSiteSettings.content.resultLabelsByGroup["3"],
          ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined)?.["3"] || {}),
        },
        "4": {
          ...defaultSiteSettings.content.resultLabelsByGroup["4"],
          ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined)?.["4"] || {}),
        },
        "5": {
          ...defaultSiteSettings.content.resultLabelsByGroup["5"],
          ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined)?.["5"] || {}),
        },
        default: {
          ...defaultSiteSettings.content.resultLabelsByGroup.default,
          ...((incoming.content?.resultLabelsByGroup as Partial<SiteSettings["content"]["resultLabelsByGroup"]> | undefined)?.default || {}),
        },
      },
    },
    flow: {
      notices: Array.isArray(incoming.flow?.notices)
        ? incoming.flow!.notices
            .filter((n) => n && typeof n === "object")
            .map((n, idx) => {
              const o = n as Partial<SiteSettings["flow"]["notices"][number]>;
              return {
                id: String(o.id || `notice-${Date.now()}-${idx}`),
                placement:
                  o.placement === "beforeCamera" ||
                  o.placement === "beforeResult" ||
                  o.placement === "beforeSurvey" ||
                  o.placement === "beforeHomeLogin"
                    ? o.placement
                    : "beforeCamera",
                title: typeof o.title === "string" ? o.title : "提示",
                body: typeof o.body === "string" ? o.body : "",
                enabled: o.enabled !== false,
              };
            })
        : defaultSiteSettings.flow.notices,
    },
    generate: {
      imageCountByGroup: {
        ...defaultSiteSettings.generate.imageCountByGroup,
        ...((incoming.generate?.imageCountByGroup as Partial<SiteSettings["generate"]["imageCountByGroup"]> | undefined) || {}),
        "1": Number(incoming.generate?.imageCountByGroup?.["1"] || defaultSiteSettings.generate.imageCountByGroup["1"]) === 2 ? 2 : 1,
        "2": Number(incoming.generate?.imageCountByGroup?.["2"] || defaultSiteSettings.generate.imageCountByGroup["2"]) === 2 ? 2 : 1,
        "3": Number(incoming.generate?.imageCountByGroup?.["3"] || defaultSiteSettings.generate.imageCountByGroup["3"]) === 2 ? 2 : 1,
        "4": Number(incoming.generate?.imageCountByGroup?.["4"] || defaultSiteSettings.generate.imageCountByGroup["4"]) === 2 ? 2 : 1,
        "5": Number(incoming.generate?.imageCountByGroup?.["5"] || defaultSiteSettings.generate.imageCountByGroup["5"]) === 2 ? 2 : 1,
        default: Number(incoming.generate?.imageCountByGroup?.default || defaultSiteSettings.generate.imageCountByGroup.default) === 2 ? 2 : 1,
      },
    },
  };
}

export async function readSiteSettings(): Promise<SiteSettings> {
  if (hasRedisEnv) {
    const raw = await redisCommand(["GET", REDIS_KEY]);
    if (!raw || typeof raw !== "string") return defaultSiteSettings;
    try {
      return mergeSettings(JSON.parse(raw) as Partial<SiteSettings>);
    } catch {
      return defaultSiteSettings;
    }
  }

  const filePath = path.join(process.cwd(), SETTINGS_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return mergeSettings(JSON.parse(raw) as Partial<SiteSettings>);
  } catch {
    return defaultSiteSettings;
  }
}

export async function writeSiteSettings(settings: Partial<SiteSettings>): Promise<SiteSettings> {
  const merged = mergeSettings(settings);
  if (hasRedisEnv) {
    await redisCommand(["SET", REDIS_KEY, JSON.stringify(merged)]);
    return merged;
  }

  const filePath = path.join(process.cwd(), SETTINGS_FILE);
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

export type SiteSettingsSnapshot = {
  id: string;
  createdAt: string;
  note: string;
  settings: SiteSettings;
};

const MAX_SNAPSHOTS = 30;

async function readSnapshotsRaw(): Promise<SiteSettingsSnapshot[]> {
  if (hasRedisEnv) {
    const raw = await redisCommand(["GET", REDIS_SNAPSHOTS_KEY]);
    if (!raw || typeof raw !== "string") return [];
    try {
      const parsed = JSON.parse(raw) as SiteSettingsSnapshot[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }
  const filePath = path.join(process.cwd(), SNAPSHOTS_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SiteSettingsSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

async function writeSnapshotsRaw(snapshots: SiteSettingsSnapshot[]): Promise<void> {
  const normalized = snapshots.slice(0, MAX_SNAPSHOTS);
  if (hasRedisEnv) {
    await redisCommand(["SET", REDIS_SNAPSHOTS_KEY, JSON.stringify(normalized)]);
    return;
  }
  const filePath = path.join(process.cwd(), SNAPSHOTS_FILE);
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf-8");
}

export async function listSiteSettingsSnapshots(): Promise<SiteSettingsSnapshot[]> {
  return readSnapshotsRaw();
}

export async function createSiteSettingsSnapshot(note: string): Promise<SiteSettingsSnapshot> {
  const current = await readSiteSettings();
  const snapshots = await readSnapshotsRaw();
  const snapshot: SiteSettingsSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    note: note.trim() || "手动快照",
    settings: current,
  };
  const next = [snapshot, ...snapshots];
  await writeSnapshotsRaw(next);
  return snapshot;
}

export async function rollbackSiteSettingsSnapshot(
  id: string,
): Promise<{ ok: boolean; settings?: SiteSettings; message?: string }> {
  const snapshots = await readSnapshotsRaw();
  const target = snapshots.find((s) => s.id === id.trim());
  if (!target) return { ok: false, message: "未找到该快照" };
  const saved = await writeSiteSettings(target.settings);
  return { ok: true, settings: saved };
}
