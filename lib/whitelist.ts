import fs from "fs/promises";
import path from "path";

/**
 * 白名单 CSV 行结构（与项目根目录 whitelist.csv 对应）
 * - name: 姓名（须与表单输入完全一致）
 * - id: 编号（须与表单输入完全一致）
 * - group: 分组代号，用于后续文案与问卷 URL 映射
 */
export type WhitelistEntry = {
  name: string;
  id: string;
  group: string;
  allowedEntries: number;
  actualEntries: number;
  entryLogs: Array<{
    timestamp: string;
  }>;
};

export type AdminAuditLog = {
  action: "add" | "update" | "delete";
  actor: string;
  targetId: string;
  detail: string;
  createdAt: string;
};

const REDIS_WHITELIST_KEY = "whitelist:entries";
const REDIS_AUDIT_LIST_KEY = "admin:audit:whitelist";
const AUDIT_LOG_FILE = "admin-audit-log.jsonl";
const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

// 内存缓存（CSV 模式下使用）
let whitelistCache: WhitelistEntry[] | null = null;
let lastLoadTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10分钟缓存

// 并发控制
let loading = false;
let loadPromise: Promise<WhitelistEntry[]> | null = null;

async function redisCommand(parts: string[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const endpoint = `${url.replace(/\/$/, "")}/${parts.map((p) => encodeURIComponent(p)).join("/")}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`redis command failed: ${res.status}`);
  }
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

function normalizeEntry(entry: WhitelistEntry): WhitelistEntry {
  return {
    name: entry.name.trim(),
    id: entry.id.trim(),
    group: entry.group.trim(),
    allowedEntries: entry.allowedEntries || 2,
    actualEntries: entry.actualEntries || 0,
    entryLogs: entry.entryLogs || [],
  };
}

async function readWhitelistFromRedis(): Promise<WhitelistEntry[]> {
  const raw = await redisCommand(["GET", REDIS_WHITELIST_KEY]);
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as WhitelistEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.name === "string" && typeof e.id === "string" && typeof e.group === "string")
      .map(normalizeEntry);
  } catch {
    return [];
  }
}

async function writeWhitelistToRedis(entries: WhitelistEntry[]): Promise<void> {
  await redisCommand(["SET", REDIS_WHITELIST_KEY, JSON.stringify(entries)]);
}

async function readWhitelistFromCsv(): Promise<WhitelistEntry[]> {
  const root = process.cwd();
  const filePath = path.join(root, "whitelist.csv");
  const raw = await fs.readFile(filePath, "utf-8");
  const text = raw.replace(/^\uFEFF/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const rows: WhitelistEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((c) => c.trim());
    if (parts.length < 3) continue;
    rows.push({
      name: parts[0],
      id: parts[1],
      group: parts[2],
      allowedEntries: 2,
      actualEntries: 0,
      entryLogs: [],
    });
  }
  return rows;
}

async function writeWhitelistToCsv(entries: WhitelistEntry[]): Promise<void> {
  const root = process.cwd();
  const filePath = path.join(root, "whitelist.csv");
  const lines = ["姓名,编号,分组"];
  for (const e of entries) {
    lines.push(`${e.name},${e.id},${e.group}`);
  }
  await fs.writeFile(filePath, lines.join("\n"), "utf-8");
  
  // 保存次数管理数据到单独的JSON文件
  const countsFilePath = path.join(root, "whitelist-counts.json");
  const countsData = entries.map((e) => ({
    id: e.id,
    allowedEntries: e.allowedEntries,
    actualEntries: e.actualEntries,
    entryLogs: e.entryLogs,
  }));
  await fs.writeFile(countsFilePath, JSON.stringify(countsData, null, 2), "utf-8");
}

async function appendAuditLog(log: AdminAuditLog): Promise<void> {
  if (hasRedisEnv) {
    await redisCommand(["LPUSH", REDIS_AUDIT_LIST_KEY, JSON.stringify(log)]);
    await redisCommand(["LTRIM", REDIS_AUDIT_LIST_KEY, "0", "199"]);
    return;
  }
  const root = process.cwd();
  const filePath = path.join(root, AUDIT_LOG_FILE);
  const line = `${JSON.stringify(log)}\n`;
  await fs.appendFile(filePath, line, "utf-8");
}

export async function listAuditLogs(limit = 50): Promise<AdminAuditLog[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  if (hasRedisEnv) {
    const raw = await redisCommand([
      "LRANGE",
      REDIS_AUDIT_LIST_KEY,
      "0",
      String(safeLimit - 1),
    ]);
    if (!Array.isArray(raw)) return [];
    const parsed = raw
      .map((item) => {
        if (typeof item !== "string") return null;
        try {
          return JSON.parse(item) as AdminAuditLog;
        } catch {
          return null;
        }
      })
      .filter((item): item is AdminAuditLog => Boolean(item));
    return parsed;
  }

  const root = process.cwd();
  const filePath = path.join(root, AUDIT_LOG_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const logs = lines
      .map((line) => {
        try {
          return JSON.parse(line) as AdminAuditLog;
        } catch {
          return null;
        }
      })
      .filter((item): item is AdminAuditLog => Boolean(item));
    return logs.slice(-safeLimit).reverse();
  } catch {
    return [];
  }
}

/**
 * 从项目根目录读取 whitelist.csv 并解析为结构化数组。
 * CSV 约定：第一行为表头「姓名,编号,分组」，数据行使用英文逗号分隔。
 * 支持 UTF-8 BOM（Excel 另存为 UTF-8 时常带 BOM）。
 */
export async function loadWhitelistFromDisk(): Promise<WhitelistEntry[]> {
  if (hasRedisEnv) {
    return readWhitelistFromRedis();
  }

  // 检查缓存是否有效
  if (whitelistCache && (Date.now() - lastLoadTime) < CACHE_DURATION) {
    return whitelistCache;
  }

  // 避免并发加载，使用加载锁
  if (loading) {
    if (loadPromise) {
      return loadPromise;
    }
  }

  loading = true;
  loadPromise = (async () => {
    try {
      const rows = await readWhitelistFromCsv();
      
      // 读取次数管理数据
      const countsFilePath = path.join(process.cwd(), "whitelist-counts.json");
      try {
        const countsRaw = await fs.readFile(countsFilePath, "utf-8");
        const countsData = JSON.parse(countsRaw);
        const countsArray = countsData as Array<{ id: string; allowedEntries?: number; actualEntries?: number; entryLogs?: Array<{ timestamp: string }> }>;
        const countsMap = new Map<string, typeof countsArray[0]>();
        countsArray.forEach(item => countsMap.set(item.id, item));
        
        // 合并次数数据
        for (const row of rows) {
          if (countsMap.has(row.id)) {
            const counts = countsMap.get(row.id) as { allowedEntries?: number; actualEntries?: number; entryLogs?: Array<{ timestamp: string }> };
            row.allowedEntries = counts.allowedEntries || 2;
            row.actualEntries = counts.actualEntries || 0;
            row.entryLogs = counts.entryLogs || [];
          }
        }
      } catch (error) {
        // 如果文件不存在或解析错误，使用默认值
        console.error("[whitelist] 读取次数管理文件出错:", error);
      }
      
      // 更新缓存
      whitelistCache = rows;
      lastLoadTime = Date.now();
      return rows;
    } catch (error) {
      console.error("[whitelist] 读取白名单文件出错:", error);
      return [];
    } finally {
      loading = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * 校验姓名与编号是否与白名单某一行完全匹配（区分大小写与空格，已在 CSV 解析时 trim）
 */
export async function findWhitelistMatch(
  name: string,
  id: string,
): Promise<WhitelistEntry | null> {
  const list = await loadWhitelistFromDisk();
  const n = name.trim();
  const sid = id.trim();
  const match = list.find((e) => e.name === n && e.id === sid);
  return match ?? null;
}

/**
 * 清除缓存，强制重新加载白名单
 */
export function clearWhitelistCache(): void {
  whitelistCache = null;
  lastLoadTime = 0;
  console.log("[whitelist] 缓存已清除");
}

export async function listWhitelistEntries(): Promise<WhitelistEntry[]> {
  return loadWhitelistFromDisk();
}

export async function addWhitelistEntry(
  entry: WhitelistEntry,
  actor = "system",
): Promise<{ ok: boolean; message?: string }> {
  const normalized = normalizeEntry(entry);
  if (!normalized.name || !normalized.id || !normalized.group) {
    return { ok: false, message: "姓名、编号、分组均不能为空" };
  }
  const all = await loadWhitelistFromDisk();
  const duplicated = all.some((e) => e.id === normalized.id);
  if (duplicated) {
    return { ok: false, message: "该编号已存在" };
  }
  const next = [...all, normalized];
  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "add",
    actor,
    targetId: normalized.id,
    detail: `新增 ${normalized.name} / group ${normalized.group}`,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function removeWhitelistEntry(
  id: string,
  actor = "system",
): Promise<{ ok: boolean; message?: string }> {
  const targetId = id.trim();
  if (!targetId) return { ok: false, message: "编号不能为空" };
  const all = await loadWhitelistFromDisk();
  const removed = all.find((e) => e.id === targetId);
  const next = all.filter((e) => e.id !== targetId);
  if (next.length === all.length) {
    return { ok: false, message: "未找到该编号" };
  }
  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "delete",
    actor,
    targetId,
    detail: removed
      ? `删除 ${removed.name} / group ${removed.group}`
      : "删除记录",
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function updateWhitelistEntry(
  id: string,
  patch: { name?: string; group?: string },
  actor = "system",
): Promise<{ ok: boolean; message?: string }> {
  const targetId = id.trim();
  if (!targetId) return { ok: false, message: "编号不能为空" };
  const all = await loadWhitelistFromDisk();
  const index = all.findIndex((e) => e.id === targetId);
  if (index < 0) return { ok: false, message: "未找到该编号" };

  const prev = all[index];
  const nextEntry = normalizeEntry({
    id: prev.id,
    name: patch.name ?? prev.name,
    group: patch.group ?? prev.group,
    allowedEntries: prev.allowedEntries,
    actualEntries: prev.actualEntries,
    entryLogs: prev.entryLogs,
  });
  if (!nextEntry.name || !nextEntry.group) {
    return { ok: false, message: "姓名和分组不能为空" };
  }

  const next = [...all];
  next[index] = nextEntry;
  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "update",
    actor,
    targetId,
    detail: `姓名 ${prev.name} -> ${nextEntry.name}; 分组 ${prev.group} -> ${nextEntry.group}`,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function batchUpdateWhitelistGroup(
  ids: string[],
  group: string,
  actor = "system",
): Promise<{ ok: boolean; updated: number; skipped: number; message?: string }> {
  const targetGroup = group.trim();
  const idSet = new Set(ids.map((id) => id.trim()).filter(Boolean));
  if (!targetGroup) {
    return { ok: false, updated: 0, skipped: ids.length, message: "分组不能为空" };
  }
  if (idSet.size === 0) {
    return { ok: false, updated: 0, skipped: 0, message: "请至少选择一条记录" };
  }

  const all = await loadWhitelistFromDisk();
  let updated = 0;
  const next = all.map((entry) => {
    if (!idSet.has(entry.id)) return entry;
    if (entry.group === targetGroup) return entry;
    updated += 1;
    return { ...entry, group: targetGroup };
  });
  const skipped = idSet.size - updated;

  if (updated === 0) {
    return { ok: false, updated: 0, skipped, message: "没有可更新的记录" };
  }

  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "update",
    actor,
    targetId: "*batch*",
    detail: `批量改组 ${updated} 条 -> group ${targetGroup}，跳过 ${skipped} 条`,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, updated, skipped };
}

export async function batchRemoveWhitelistEntries(
  ids: string[],
  actor = "system",
): Promise<{ ok: boolean; removed: number; skipped: number; message?: string }> {
  const idSet = new Set(ids.map((id) => id.trim()).filter(Boolean));
  if (idSet.size === 0) {
    return { ok: false, removed: 0, skipped: 0, message: "请至少选择一条记录" };
  }
  const all = await loadWhitelistFromDisk();
  const next = all.filter((e) => !idSet.has(e.id));
  const removed = all.length - next.length;
  const skipped = idSet.size - removed;

  if (removed === 0) {
    return { ok: false, removed: 0, skipped, message: "未找到可删除记录" };
  }

  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "delete",
    actor,
    targetId: "*batch*",
    detail: `批量删除 ${removed} 条，跳过 ${skipped} 条`,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, removed, skipped };
}

export async function importWhitelistFromCsvText(
  csvText: string,
  actor = "system",
): Promise<{ ok: boolean; added: number; skipped: number; message?: string }> {
  const text = csvText.replace(/^\uFEFF/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, added: 0, skipped: 0, message: "导入内容为空" };
  }

  const first = lines[0].replace(/\s+/g, "");
  const startIndex = first.includes("姓名") && first.includes("编号") ? 1 : 0;

  const all = await loadWhitelistFromDisk();
  const idSet = new Set(all.map((e) => e.id));
  const next = [...all];
  let added = 0;
  let skipped = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(",").map((c) => c.trim());
    if (parts.length < 3) {
      skipped += 1;
      continue;
    }
    const row = normalizeEntry({
      name: parts[0],
      id: parts[1],
      group: parts[2],
      allowedEntries: 2,
      actualEntries: 0,
      entryLogs: [],
    });
    if (!row.name || !row.id || !row.group || idSet.has(row.id)) {
      skipped += 1;
      continue;
    }
    next.push(row);
    idSet.add(row.id);
    added += 1;
  }

  if (added === 0) {
    return {
      ok: false,
      added: 0,
      skipped,
      message: "没有可导入的新记录（可能都重复或格式不正确）",
    };
  }

  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "add",
    actor,
    targetId: "*batch*",
    detail: `批量导入 ${added} 条，跳过 ${skipped} 条`,
    createdAt: new Date().toISOString(),
  });

  return { ok: true, added, skipped };
}

/**
 * 更新账号的允许进入次数
 */
export async function updateWhitelistEntryAllowedEntries(
  id: string,
  allowedEntries: number,
  actor = "system",
): Promise<{ ok: boolean; message?: string }> {
  const targetId = id.trim();
  if (!targetId) return { ok: false, message: "编号不能为空" };
  const all = await loadWhitelistFromDisk();
  const index = all.findIndex((e) => e.id === targetId);
  if (index < 0) return { ok: false, message: "未找到该编号" };

  const prev = all[index];
  const nextEntry = {
    ...prev,
    allowedEntries,
  };

  const next = [...all];
  next[index] = nextEntry;
  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "update",
    actor,
    targetId,
    detail: `允许进入次数 ${prev.allowedEntries} -> ${allowedEntries}`,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

/**
 * 记录账号的实际进入次数
 */
export async function recordWhitelistEntryAccess(
  id: string,
): Promise<{ ok: boolean; remaining: number; message?: string }> {
  const targetId = id.trim();
  if (!targetId) return { ok: false, remaining: 0, message: "编号不能为空" };
  const all = await loadWhitelistFromDisk();
  const index = all.findIndex((e) => e.id === targetId);
  if (index < 0) return { ok: false, remaining: 0, message: "未找到该编号" };

  const prev = all[index];
  if (prev.actualEntries >= prev.allowedEntries) {
    return { ok: false, remaining: 0, message: "已达到允许进入次数上限" };
  }

  const nextEntry = {
    ...prev,
    actualEntries: prev.actualEntries + 1,
    entryLogs: [
      ...prev.entryLogs,
      { timestamp: new Date().toISOString() },
    ],
  };

  const next = [...all];
  next[index] = nextEntry;
  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }

  const remaining = nextEntry.allowedEntries - nextEntry.actualEntries;
  return { ok: true, remaining };
}

/**
 * 批量更新账号的允许进入次数
 */
export async function batchUpdateWhitelistAllowedEntries(
  ids: string[],
  allowedEntries: number,
  actor = "system",
): Promise<{ ok: boolean; updated: number; skipped: number; message?: string }> {
  const idSet = new Set(ids.map((id) => id.trim()).filter(Boolean));
  if (idSet.size === 0) {
    return { ok: false, updated: 0, skipped: 0, message: "请至少选择一条记录" };
  }

  const all = await loadWhitelistFromDisk();
  let updated = 0;
  const next = all.map((entry) => {
    if (!idSet.has(entry.id)) return entry;
    if (entry.allowedEntries === allowedEntries) return entry;
    updated += 1;
    return { ...entry, allowedEntries };
  });
  const skipped = idSet.size - updated;

  if (updated === 0) {
    return { ok: false, updated: 0, skipped, message: "没有可更新的记录" };
  }

  if (hasRedisEnv) {
    await writeWhitelistToRedis(next);
  } else {
    await writeWhitelistToCsv(next);
    clearWhitelistCache();
  }
  await appendAuditLog({
    action: "update",
    actor,
    targetId: "*batch*",
    detail: `批量更新允许进入次数 ${updated} 条 -> ${allowedEntries} 次，跳过 ${skipped} 条`,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, updated, skipped };
}
