import fs from "fs/promises";
import path from "path";

export type EnvConfig = {
  DASHSCOPE_API_KEY_1: string;
  DASHSCOPE_API_KEY_2: string;
  DASHSCOPE_API_KEY_3: string;
  DASHSCOPE_API_KEY_4: string;
  DASHSCOPE_API_KEY_5: string;
  DASHSCOPE_IMAGE_MODEL_1: string;
  DASHSCOPE_IMAGE_MODEL_2: string;
  DASHSCOPE_IMAGE_MODEL_3: string;
  DASHSCOPE_IMAGE_MODEL_4: string;
  DASHSCOPE_IMAGE_MODEL_5: string;
  DASHSCOPE_IMAGE_PROMPT_1: string;
  DASHSCOPE_IMAGE_PROMPT_2: string;
  DASHSCOPE_IMAGE_PROMPT_3: string;
  DASHSCOPE_IMAGE_PROMPT_4: string;
  DASHSCOPE_IMAGE_PROMPT_5: string;
};

const ENV_FILE = ".env.local";

const KEYS: Array<keyof EnvConfig> = [
  "DASHSCOPE_API_KEY_1",
  "DASHSCOPE_API_KEY_2",
  "DASHSCOPE_API_KEY_3",
  "DASHSCOPE_API_KEY_4",
  "DASHSCOPE_API_KEY_5",
  "DASHSCOPE_IMAGE_MODEL_1",
  "DASHSCOPE_IMAGE_MODEL_2",
  "DASHSCOPE_IMAGE_MODEL_3",
  "DASHSCOPE_IMAGE_MODEL_4",
  "DASHSCOPE_IMAGE_MODEL_5",
  "DASHSCOPE_IMAGE_PROMPT_1",
  "DASHSCOPE_IMAGE_PROMPT_2",
  "DASHSCOPE_IMAGE_PROMPT_3",
  "DASHSCOPE_IMAGE_PROMPT_4",
  "DASHSCOPE_IMAGE_PROMPT_5",
];

function emptyEnvConfig(): EnvConfig {
  return {
    DASHSCOPE_API_KEY_1: "",
    DASHSCOPE_API_KEY_2: "",
    DASHSCOPE_API_KEY_3: "",
    DASHSCOPE_API_KEY_4: "",
    DASHSCOPE_API_KEY_5: "",
    DASHSCOPE_IMAGE_MODEL_1: "",
    DASHSCOPE_IMAGE_MODEL_2: "",
    DASHSCOPE_IMAGE_MODEL_3: "",
    DASHSCOPE_IMAGE_MODEL_4: "",
    DASHSCOPE_IMAGE_MODEL_5: "",
    DASHSCOPE_IMAGE_PROMPT_1: "",
    DASHSCOPE_IMAGE_PROMPT_2: "",
    DASHSCOPE_IMAGE_PROMPT_3: "",
    DASHSCOPE_IMAGE_PROMPT_4: "",
    DASHSCOPE_IMAGE_PROMPT_5: "",
  };
}

function parseEnvText(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    map[key] = value;
  }
  return map;
}

export async function readEnvConfig(): Promise<EnvConfig> {
  const filePath = path.join(process.cwd(), ENV_FILE);
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return emptyEnvConfig();
  }
  const map = parseEnvText(raw);
  const output = emptyEnvConfig();
  for (const key of KEYS) {
    output[key] = map[key] || "";
  }
  return output;
}

export async function writeEnvConfig(patch: Partial<EnvConfig>): Promise<EnvConfig> {
  const filePath = path.join(process.cwd(), ENV_FILE);
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    raw = "";
  }
  const lines = raw ? raw.split(/\r?\n/) : [];
  const next = [...lines];
  const keySet = new Set<string>();

  for (let i = 0; i < next.length; i++) {
    const line = next[i];
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!KEYS.includes(key as keyof EnvConfig)) continue;
    keySet.add(key);
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      next[i] = `${key}=${String(patch[key as keyof EnvConfig] ?? "")}`;
    }
  }

  for (const key of KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (keySet.has(key)) continue;
    next.push(`${key}=${String(patch[key] ?? "")}`);
  }

  await fs.writeFile(filePath, next.join("\n"), "utf-8");
  return readEnvConfig();
}
