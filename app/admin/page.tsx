"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useExperiment, type Participant } from "@/context/ExperimentContext";

type Entry = {
  name: string;
  id: string;
  group: string;
  allowedEntries: number;
  actualEntries: number;
  entryLogs: Array<{
    timestamp: string;
  }>;
};

type AuditLog = {
  action: "add" | "update" | "delete";
  actor: string;
  targetId: string;
  detail: string;
  createdAt: string;
};

type SiteSettings = {
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
    defaultBeforeSurveyNoticeTitle: string;
    defaultBeforeSurveyNoticeBody: string;
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

type EnvConfig = {
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

type SettingsSnapshot = {
  id: string;
  createdAt: string;
  note: string;
};

export default function AdminPage() {
  const isDevEnv = process.env.NODE_ENV !== "production";
  const allowDevTools =
    isDevEnv || process.env.NEXT_PUBLIC_ADMIN_ENABLE_DEV_TOOLS === "true";
  const router = useRouter();
  const { setParticipant } = useExperiment();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroup, setBulkGroup] = useState("");
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingGroup, setEditingGroup] = useState("");
  const [importText, setImportText] = useState("");
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [envConfig, setEnvConfig] = useState<EnvConfig | null>(null);
  const [previewTab, setPreviewTab] = useState<"home" | "experiment" | "notices">("home");
  const [devGroup, setDevGroup] = useState("1");
  const [devLoading, setDevLoading] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshots, setSnapshots] = useState<SettingsSnapshot[]>([]);

  const refreshEntries = useCallback(async () => {
    const res = await fetch("/api/admin/whitelist", { method: "GET" });
    if (!res.ok) throw new Error("拉取失败");
    const data = (await res.json()) as {
      ok?: boolean;
      entries?: Entry[];
      audits?: AuditLog[];
    };
    setEntries(data.entries || []);
    setAudits(data.audits || []);
  }, []);

  const refreshSettings = useCallback(async () => {
    const res = await fetch("/api/admin/site-settings", { method: "GET" });
    if (!res.ok) throw new Error("拉取设置失败");
    const data = (await res.json()) as { ok?: boolean; settings?: SiteSettings; snapshots?: SettingsSnapshot[] };
    if (data.settings) setSettings(data.settings);
    setSnapshots(data.snapshots || []);
  }, []);

  const refreshEnvConfig = useCallback(async () => {
    const res = await fetch("/api/admin/env-config", { method: "GET" });
    if (!res.ok) throw new Error("拉取环境变量失败");
    const data = (await res.json()) as { ok?: boolean; envConfig?: EnvConfig };
    if (data.envConfig) setEnvConfig(data.envConfig);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/session");
        if (res.ok) {
          setAuthed(true);
          await refreshEntries();
          await refreshSettings();
          await refreshEnvConfig();
        } else {
          setAuthed(false);
        }
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshEntries, refreshEnvConfig, refreshSettings]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!data.ok) {
      setError(data.message || "登录失败");
      return;
    }
    setAuthed(true);
    setPassword("");
    await refreshEntries();
    await refreshSettings();
    await refreshEnvConfig();
  }

  async function handleDevMockEnter() {
    setError(null);
    setDevLoading(true);
    try {
      const res = await fetch("/api/dev/mock-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: devGroup }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; participant?: Participant };
      if (!data.ok || !data.participant) {
        setError(data.message || "创建开发测试身份失败");
        return;
      }
      setParticipant(data.participant);
      router.push("/experiment");
    } catch {
      setError("开发模式切组失败，请重试");
    } finally {
      setDevLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setEntries([]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, id: newId, group: newGroup }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!data.ok) {
      setError(data.message || "新增失败");
      return;
    }
    setNewName("");
    setNewId("");
    setNewGroup("");
    await refreshEntries();
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch("/api/admin/whitelist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!data.ok) {
      setError(data.message || "删除失败");
      return;
    }
    await refreshEntries();
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  async function handleBatchUpdateGroup() {
    if (selectedIds.length === 0) {
      setError("请先勾选要批量修改的名单");
      return;
    }
    if (!bulkGroup.trim()) {
      setError("请先输入目标分组");
      return;
    }
    setError(null);
    const res = await fetch("/api/admin/whitelist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "batchUpdateGroup",
        ids: selectedIds,
        group: bulkGroup.trim(),
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      updated?: { changed?: number; skipped?: number };
    };
    if (!data.ok) {
      setError(data.message || "批量改组失败");
      return;
    }
    await refreshEntries();
    const changed = data.updated?.changed ?? 0;
    const skipped = data.updated?.skipped ?? 0;
    setError(`批量改组完成：更新 ${changed} 条，跳过 ${skipped} 条`);
    setSelectedIds([]);
  }

  async function handleBatchDelete() {
    if (selectedIds.length === 0) {
      setError("请先勾选要删除的名单");
      return;
    }
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 条记录吗？`)) {
      return;
    }
    setError(null);
    const res = await fetch("/api/admin/whitelist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      deleted?: { removed?: number; skipped?: number };
    };
    if (!data.ok) {
      setError(data.message || "批量删除失败");
      return;
    }
    await refreshEntries();
    const removed = data.deleted?.removed ?? 0;
    const skipped = data.deleted?.skipped ?? 0;
    setError(`批量删除完成：删除 ${removed} 条，跳过 ${skipped} 条`);
    setSelectedIds([]);
  }

  function beginEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditingName(entry.name);
    setEditingGroup(entry.group);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingGroup("");
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setError(null);
    const res = await fetch("/api/admin/whitelist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        name: editingName,
        group: editingGroup,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!data.ok) {
      setError(data.message || "更新失败");
      return;
    }
    cancelEdit();
    await refreshEntries();
  }

  async function handleImportCsv(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "import", csvText: importText }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      imported?: { added?: number; skipped?: number };
    };
    if (!data.ok) {
      setError(data.message || "导入失败");
      return;
    }
    setImportText("");
    await refreshEntries();
    const added = data.imported?.added ?? 0;
    const skipped = data.imported?.skipped ?? 0;
    setError(`导入完成：新增 ${added} 条，跳过 ${skipped} 条`);
  }

  async function handleImportCsvFile(file: File) {
    const text = await file.text();
    setImportText(text);
  }

  async function handleExportAuditsCsv() {
    setError(null);
    const res = await fetch("/api/admin/whitelist", { method: "PATCH" });
    if (!res.ok) {
      setError("导出失败");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function saveSiteSettings() {
    if (!settings) return;
    setError(null);
    const res = await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!data.ok) {
      setError(data.message || "保存站点设置失败");
      return;
    }
    setError("站点设置已保存");
  }

  async function resetSiteSettings() {
    setError(null);
    const res = await fetch("/api/admin/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "reset" }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; settings?: SiteSettings };
    if (!data.ok) {
      setError(data.message || "恢复默认失败");
      return;
    }
    if (data.settings) setSettings(data.settings);
    setError("已恢复默认配置");
  }

  async function exportSiteSettingsJson() {
    setError(null);
    const res = await fetch("/api/admin/site-settings", { method: "PATCH" });
    if (!res.ok) {
      setError("导出配置失败");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `site-settings-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importSiteSettingsJsonFile(file: File) {
    setError(null);
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("JSON 文件格式不正确");
      return;
    }
    const res = await fetch("/api/admin/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "import", settings: parsed }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; settings?: SiteSettings };
    if (!data.ok) {
      setError(data.message || "导入配置失败");
      return;
    }
    if (data.settings) setSettings(data.settings);
    setError("配置已导入并生效");
  }

  function getExperimentTemplateFromSettings(current: SiteSettings) {
    return {
      content: {
        consentIntro: current.content.consentIntro,
        consentItemsText: current.content.consentItemsText,
        consentAgreementText: current.content.consentAgreementText,
        noticeContactPrefix: current.content.noticeContactPrefix,
        noticeAgreeHint: current.content.noticeAgreeHint,
        experimentExitText: current.content.experimentExitText,
        experimentNextButtonText: current.content.experimentNextButtonText,
        surveyPageTitle: current.content.surveyPageTitle,
        surveyExitText: current.content.surveyExitText,
        cameraHint: current.content.cameraHint,
        loadingTitle: current.content.loadingTitle,
        loadingSubtitle: current.content.loadingSubtitle,
        defaultBeforeSurveyNoticeTitle: current.content.defaultBeforeSurveyNoticeTitle,
        defaultBeforeSurveyNoticeBody: current.content.defaultBeforeSurveyNoticeBody,
        surveyUrls: current.content.surveyUrls,
        groupGuideTexts: current.content.groupGuideTexts,
        resultLabelsByGroup: current.content.resultLabelsByGroup,
      },
    };
  }

  async function exportExperimentTemplateJson() {
    if (!settings) return;
    const template = getExperimentTemplateFromSettings(settings);
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `experiment-template-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value: string): string {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  async function exportExperimentTemplateCsv() {
    if (!settings) return;
    const template = getExperimentTemplateFromSettings(settings);
    const rows = [
      ["key", "value"],
      ["content.consentIntro", template.content.consentIntro],
      ["content.consentItemsText", template.content.consentItemsText],
      ["content.consentAgreementText", template.content.consentAgreementText],
      ["content.noticeContactPrefix", template.content.noticeContactPrefix],
      ["content.noticeAgreeHint", template.content.noticeAgreeHint],
      ["content.experimentExitText", template.content.experimentExitText],
      ["content.experimentNextButtonText", template.content.experimentNextButtonText],
      ["content.surveyPageTitle", template.content.surveyPageTitle],
      ["content.surveyExitText", template.content.surveyExitText],
      ["content.cameraHint", template.content.cameraHint],
      ["content.loadingTitle", template.content.loadingTitle],
      ["content.loadingSubtitle", template.content.loadingSubtitle],
      ["content.defaultBeforeSurveyNoticeTitle", template.content.defaultBeforeSurveyNoticeTitle],
      ["content.defaultBeforeSurveyNoticeBody", template.content.defaultBeforeSurveyNoticeBody],
      ["content.surveyUrls", JSON.stringify(template.content.surveyUrls)],
      ["content.groupGuideTexts", JSON.stringify(template.content.groupGuideTexts)],
      ["content.resultLabelsByGroup", JSON.stringify(template.content.resultLabelsByGroup)],
    ];
    const content = rows.map((r) => `${csvEscape(r[0])},${csvEscape(r[1])}`).join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `experiment-template-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importExperimentTemplateFile(file: File) {
    if (!settings) return;
    setError(null);
    const text = await file.text();
    let patchContent: Partial<SiteSettings["content"]> | null = null;
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const parsed = JSON.parse(text) as { content?: Partial<SiteSettings["content"]> };
        patchContent = parsed.content || null;
      } catch {
        setError("模板 JSON 格式不正确");
        return;
      }
    } else {
      const lines = text.split(/\r?\n/).filter(Boolean);
      const map = new Map<string, string>();
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^"((?:[^"]|"")*)","((?:[^"]|"")*)"$/);
        if (!m) continue;
        const k = m[1].replace(/""/g, "\"");
        const v = m[2].replace(/""/g, "\"");
        map.set(k, v);
      }
      patchContent = {
        consentIntro: map.get("content.consentIntro"),
        consentItemsText: map.get("content.consentItemsText"),
        consentAgreementText: map.get("content.consentAgreementText"),
        noticeContactPrefix: map.get("content.noticeContactPrefix"),
        noticeAgreeHint: map.get("content.noticeAgreeHint"),
        experimentExitText: map.get("content.experimentExitText"),
        experimentNextButtonText: map.get("content.experimentNextButtonText"),
        surveyPageTitle: map.get("content.surveyPageTitle"),
        surveyExitText: map.get("content.surveyExitText"),
        cameraHint: map.get("content.cameraHint"),
        loadingTitle: map.get("content.loadingTitle"),
        loadingSubtitle: map.get("content.loadingSubtitle"),
        defaultBeforeSurveyNoticeTitle: map.get("content.defaultBeforeSurveyNoticeTitle"),
        defaultBeforeSurveyNoticeBody: map.get("content.defaultBeforeSurveyNoticeBody"),
      } as Partial<SiteSettings["content"]>;
      const surveyUrls = map.get("content.surveyUrls");
      const groupGuideTexts = map.get("content.groupGuideTexts");
      const resultLabelsByGroup = map.get("content.resultLabelsByGroup");
      try {
        if (surveyUrls) patchContent.surveyUrls = JSON.parse(surveyUrls);
        if (groupGuideTexts) patchContent.groupGuideTexts = JSON.parse(groupGuideTexts);
        if (resultLabelsByGroup) patchContent.resultLabelsByGroup = JSON.parse(resultLabelsByGroup);
      } catch {
        setError("CSV 中 JSON 字段解析失败，请检查格式");
        return;
      }
    }
    if (!patchContent) {
      setError("未找到可导入的模板内容");
      return;
    }
    const merged: SiteSettings = {
      ...settings,
      content: {
        ...settings.content,
        ...patchContent,
      },
    };
    setSettings(merged);
    setError("模板已载入到当前编辑区，点击“保存站点配置”后生效");
  }

  async function createSettingsSnapshot() {
    setError(null);
    const res = await fetch("/api/admin/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "createSnapshot", note: snapshotNote }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; snapshots?: SettingsSnapshot[] };
    if (!data.ok) {
      setError(data.message || "创建快照失败");
      return;
    }
    setSnapshots(data.snapshots || []);
    setSnapshotNote("");
    setError("站点配置快照已创建");
  }

  async function rollbackSettingsSnapshot(id: string) {
    setError(null);
    const res = await fetch("/api/admin/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "rollbackSnapshot", snapshotId: id }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      settings?: SiteSettings;
      snapshots?: SettingsSnapshot[];
    };
    if (!data.ok) {
      setError(data.message || "回滚失败");
      return;
    }
    if (data.settings) setSettings(data.settings);
    setSnapshots(data.snapshots || []);
    setError("已回滚到所选快照");
  }

  async function saveEnvConfig() {
    if (!envConfig) return;
    setError(null);
    const res = await fetch("/api/admin/env-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envConfig }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; envConfig?: EnvConfig };
    if (!data.ok) {
      setError(data.message || "保存环境变量失败");
      return;
    }
    if (data.envConfig) setEnvConfig(data.envConfig);
    setError(data.message || "环境变量已更新，请重启服务使其生效");
  }

  function addNotice() {
    if (!settings) return;
    const id = `notice-${Date.now()}`;
    setSettings({
      ...settings,
      flow: {
        notices: [
          ...settings.flow.notices,
          {
            id,
            placement: "beforeCamera",
            title: "温馨提示",
            body: "请认真阅读后继续。",
            enabled: true,
          },
        ],
      },
    });
  }

  function updateNotice(id: string, patch: Partial<SiteSettings["flow"]["notices"][number]>) {
    if (!settings) return;
    setSettings({
      ...settings,
      flow: {
        notices: settings.flow.notices.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      },
    });
  }

  function removeNotice(id: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      flow: { notices: settings.flow.notices.filter((n) => n.id !== id) },
    });
  }

  function moveNotice(id: string, dir: -1 | 1) {
    if (!settings) return;
    const list = [...settings.flow.notices];
    const idx = list.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const to = idx + dir;
    if (to < 0 || to >= list.length) return;
    const [item] = list.splice(idx, 1);
    list.splice(to, 0, item);
    setSettings({ ...settings, flow: { notices: list } });
  }

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.includes(q) || e.id.includes(q) || e.group.includes(q),
    );
  }, [entries, search]);

  const filteredIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));

  useEffect(() => {
    const idSet = new Set(entries.map((e) => e.id));
    setSelectedIds((prev) => prev.filter((id) => idSet.has(id)));
  }, [entries]);

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((x) => x !== id);
    });
  }

  function toggleSelectAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...filteredIds]));
      const removeSet = new Set(filteredIds);
      return prev.filter((id) => !removeSet.has(id));
    });
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-4xl items-center justify-center px-4 text-slate-300">
        加载中...
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <h1 className="mb-6 text-center text-2xl font-bold text-white">白名单后台</h1>
        <form onSubmit={handleLogin} className="space-y-4 rounded-xl border border-white/10 bg-slate-900/50 p-6">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">管理员账号</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">管理员密码</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none"
            />
          </label>
          {error && <p className="rounded bg-rose-950/80 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white"
          >
            登录
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">白名单后台</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-200"
        >
          退出登录
        </button>
      </header>

      {allowDevTools && (
      <section className="mb-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">开发调试（仅开发环境）</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={devGroup}
            onChange={(e) => setDevGroup(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="1">第1组</option>
            <option value="2">第2组</option>
            <option value="3">第3组</option>
            <option value="4">第4组</option>
            <option value="5">第5组</option>
          </select>
          <button
            type="button"
            onClick={() => void handleDevMockEnter()}
            disabled={devLoading}
            className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-300 disabled:opacity-60"
          >
            {devLoading ? "创建中..." : "一键进入该分组实验"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          使用当前管理员登录态创建开发测试被试身份，并直接跳转实验页。
        </p>
      </section>
      )}

      <section className="mb-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">生图数量与模型参数控制</h2>
        <p className="mb-3 text-xs text-slate-400">
          你可以按分组设置生成图片数量（1/2张），并直接编辑服务器 .env.local 中分组 API Key、模型与提示词。
        </p>
        {settings && (
          <div className="mb-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">各组生成数量（即时影响 /api/generate）</h3>
            <div className="grid gap-2 md:grid-cols-3">
              {(["1", "2", "3", "4", "5", "default"] as const).map((g) => (
                <label key={`count-${g}`} className="rounded border border-white/10 px-2 py-2 text-xs text-slate-200">
                  分组 {g}
                  <select
                    value={String(settings.generate.imageCountByGroup[g])}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        generate: {
                          imageCountByGroup: {
                            ...settings.generate.imageCountByGroup,
                            [g]: e.target.value === "2" ? 2 : 1,
                          },
                        },
                      })
                    }
                    className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
                  >
                    <option value="1">1 张</option>
                    <option value="2">2 张</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
        {envConfig ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <h3 className="text-sm font-semibold text-slate-200">.env.local 分组生图参数</h3>
            <p className="text-xs text-amber-300">
              修改后请点击“保存 .env 配置”，并在服务器执行重启（pm2 restart）使新配置生效。
            </p>
            {(["1", "2", "3", "4", "5"] as const).map((g) => (
              <div key={`env-group-${g}`} className="rounded-lg border border-white/10 p-3">
                <div className="mb-2 text-xs text-slate-400">分组 {g}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={envConfig[`DASHSCOPE_API_KEY_${g}`]}
                    onChange={(e) =>
                      setEnvConfig({
                        ...envConfig,
                        [`DASHSCOPE_API_KEY_${g}`]: e.target.value,
                      })
                    }
                    placeholder={`DASHSCOPE_API_KEY_${g}`}
                    className="rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white"
                  />
                  <input
                    value={envConfig[`DASHSCOPE_IMAGE_MODEL_${g}`]}
                    onChange={(e) =>
                      setEnvConfig({
                        ...envConfig,
                        [`DASHSCOPE_IMAGE_MODEL_${g}`]: e.target.value,
                      })
                    }
                    placeholder={`DASHSCOPE_IMAGE_MODEL_${g}`}
                    className="rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white"
                  />
                  <textarea
                    value={envConfig[`DASHSCOPE_IMAGE_PROMPT_${g}`]}
                    onChange={(e) =>
                      setEnvConfig({
                        ...envConfig,
                        [`DASHSCOPE_IMAGE_PROMPT_${g}`]: e.target.value,
                      })
                    }
                    rows={4}
                    placeholder={`DASHSCOPE_IMAGE_PROMPT_${g}`}
                    className="rounded border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white md:col-span-2"
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEnvConfig}
                className="rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-300"
              >
                保存 .env 配置
              </button>
              <button
                type="button"
                onClick={() => void refreshEnvConfig()}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-300"
              >
                重新读取 .env
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">环境变量配置加载中...</p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">站点文案与风格配置</h2>
        {settings ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm text-slate-300">
                主按钮色
                <input
                  type="color"
                  value={settings.theme.primaryColor}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, primaryColor: e.target.value },
                    })
                  }
                  className="mt-1 h-10 w-full rounded border border-white/10 bg-slate-950"
                />
              </label>
              <label className="text-sm text-slate-300">
                主按钮文字色
                <input
                  type="color"
                  value={settings.theme.primaryTextColor}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, primaryTextColor: e.target.value },
                    })
                  }
                  className="mt-1 h-10 w-full rounded border border-white/10 bg-slate-950"
                />
              </label>
              <label className="text-sm text-slate-300">
                页面背景色
                <input
                  type="color"
                  value={settings.theme.bgColor}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, bgColor: e.target.value },
                    })
                  }
                  className="mt-1 h-10 w-full rounded border border-white/10 bg-slate-950"
                />
              </label>
            </div>
            
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                基础字体大小 (px)
                <input
                  type="number"
                  min="12"
                  max="24"
                  value={settings.theme.baseFontSizePx}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, baseFontSizePx: Number(e.target.value) },
                    })
                  }
                  className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-slate-300">
                基础字体粗细
                <input
                  type="range"
                  min="100"
                  max="900"
                  step="100"
                  value={settings.theme.baseFontWeight}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      theme: { ...settings.theme, baseFontWeight: Number(e.target.value) },
                    })
                  }
                  className="mt-1 w-full"
                />
                <div className="mt-1 text-xs text-slate-400">
                  {settings.theme.baseFontWeight === 100 && "细体"}
                  {settings.theme.baseFontWeight === 300 && "轻体"}
                  {settings.theme.baseFontWeight === 400 && "正常"}
                  {settings.theme.baseFontWeight === 500 && "中等"}
                  {settings.theme.baseFontWeight === 600 && "半粗"}
                  {settings.theme.baseFontWeight === 700 && "粗体"}
                  {settings.theme.baseFontWeight === 800 && "特粗"}
                  {settings.theme.baseFontWeight === 900 && "黑体"}
                </div>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={settings.content.homeTitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, homeTitle: e.target.value },
                  })
                }
                placeholder="首页标题"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.homeSubtitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, homeSubtitle: e.target.value },
                  })
                }
                placeholder="首页副标题"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.consentTitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, consentTitle: e.target.value },
                  })
                }
                placeholder="知情同意标题"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.contactEmail}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, contactEmail: e.target.value },
                  })
                }
                placeholder="联系邮箱"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.cameraHint}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, cameraHint: e.target.value },
                  })
                }
                placeholder="拍照引导语"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <input
                value={settings.content.cameraGuideTitle || "拍照提示"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, cameraGuideTitle: e.target.value },
                  })
                }
                placeholder="拍照提示标题"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.cameraGuideImage || "shotguide.jpg"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, cameraGuideImage: e.target.value },
                  })
                }
                placeholder="拍照提示图片路径"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <textarea
                value={settings.content.cameraGuideText || "接下来您将进入到拍照环节，请您不要遮挡脸部，也不要佩戴帽子或墨镜，确保背景纯净且没有其他人入镜，如下图所示："}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, cameraGuideText: e.target.value },
                  })
                }
                rows={4}
                placeholder="拍照提示文本"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <div className="md:col-span-2">
                <label className="block mb-2 text-sm text-slate-300">拍照提示图片上传</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const formData = new FormData();
                      formData.append('file', file);
                      const res = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData,
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.url) {
                          setSettings({
                            ...settings,
                            content: { ...settings.content, cameraGuideImage: data.url },
                          });
                        }
                      }
                    } catch (error) {
                      console.error('上传失败:', error);
                    }
                  }}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <input
                value={settings.content.loadingTitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, loadingTitle: e.target.value },
                  })
                }
                placeholder="生成中主文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.loadingSubtitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, loadingSubtitle: e.target.value },
                  })
                }
                placeholder="生成中副文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.footerText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, footerText: e.target.value },
                  })
                }
                placeholder="页脚统一文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <input
                value={settings.content.noticeContactPrefix}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, noticeContactPrefix: e.target.value },
                  })
                }
                placeholder="联系提示前缀"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <input
                value={settings.content.noticeAgreeHint}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, noticeAgreeHint: e.target.value },
                  })
                }
                placeholder="提示页同意文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <input
                value={settings.content.experimentExitText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, experimentExitText: e.target.value },
                  })
                }
                placeholder="实验页退出按钮文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.experimentNextButtonText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, experimentNextButtonText: e.target.value },
                  })
                }
                placeholder="实验页下一步按钮文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.surveyPageTitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, surveyPageTitle: e.target.value },
                  })
                }
                placeholder="问卷页标题"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={settings.content.surveyExitText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, surveyExitText: e.target.value },
                  })
                }
                placeholder="问卷页退出按钮文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
              <textarea
                value={settings.content.consentIntro}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, consentIntro: e.target.value },
                  })
                }
                rows={3}
                placeholder="知情同意导语（支持换行）"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <textarea
                value={settings.content.consentItemsText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, consentItemsText: e.target.value },
                  })
                }
                rows={8}
                placeholder="知情同意条款（每行一条，支持换行排版）"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <textarea
                value={settings.content.consentAgreementText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, consentAgreementText: e.target.value },
                  })
                }
                rows={2}
                placeholder="知情同意确认文案"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <textarea
                value={settings.content.defaultBeforeSurveyNoticeTitle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, defaultBeforeSurveyNoticeTitle: e.target.value },
                  })
                }
                rows={2}
                placeholder="默认问卷前提示标题"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
              <textarea
                value={settings.content.defaultBeforeSurveyNoticeBody}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content: { ...settings.content, defaultBeforeSurveyNoticeBody: e.target.value },
                  })
                }
                rows={8}
                placeholder="默认问卷前提示正文（支持换行排版）"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white md:col-span-2"
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">分组问卷链接（可实时替换）</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {(["1", "2", "3", "4", "5", "default"] as const).map((g) => (
                  <input
                    key={`survey-${g}`}
                    value={settings.content.surveyUrls[g]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        content: {
                          ...settings.content,
                          surveyUrls: { ...settings.content.surveyUrls, [g]: e.target.value },
                        },
                      })
                    }
                    placeholder={`分组 ${g} 问卷链接`}
                    className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">分组结果提示与末尾引导</h3>
              <div className="space-y-3">
                {(["1", "2", "3", "4", "5", "default"] as const).map((g) => (
                  <div key={`labels-${g}`} className="rounded-lg border border-white/10 p-3">
                    <div className="mb-2 text-xs text-slate-400">分组 {g}</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        value={settings.content.resultLabelsByGroup[g].selfie}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            content: {
                              ...settings.content,
                              resultLabelsByGroup: {
                                ...settings.content.resultLabelsByGroup,
                                [g]: {
                                  ...settings.content.resultLabelsByGroup[g],
                                  selfie: e.target.value,
                                },
                              },
                            },
                          })
                        }
                        placeholder="自拍图标题"
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white"
                      />
                      <input
                        value={settings.content.resultLabelsByGroup[g].generated1}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            content: {
                              ...settings.content,
                              resultLabelsByGroup: {
                                ...settings.content.resultLabelsByGroup,
                                [g]: {
                                  ...settings.content.resultLabelsByGroup[g],
                                  generated1: e.target.value,
                                },
                              },
                            },
                          })
                        }
                        placeholder="生成图1标题"
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white"
                      />
                      <input
                        value={settings.content.resultLabelsByGroup[g].generated2}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            content: {
                              ...settings.content,
                              resultLabelsByGroup: {
                                ...settings.content.resultLabelsByGroup,
                                [g]: {
                                  ...settings.content.resultLabelsByGroup[g],
                                  generated2: e.target.value,
                                },
                              },
                            },
                          })
                        }
                        placeholder="生成图2标题"
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white"
                      />
                      <textarea
                        value={settings.content.resultLabelsByGroup[g].tail}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            content: {
                              ...settings.content,
                              resultLabelsByGroup: {
                                ...settings.content.resultLabelsByGroup,
                                [g]: {
                                  ...settings.content.resultLabelsByGroup[g],
                                  tail: e.target.value,
                                },
                              },
                            },
                          })
                        }
                        rows={3}
                        placeholder="页面底部引导文案（支持换行）"
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white md:col-span-2"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">分组观察引导文案（备用）</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {(["1", "2", "3", "4", "5", "default"] as const).map((g) => (
                  <textarea
                    key={`guide-${g}`}
                    value={settings.content.groupGuideTexts[g]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        content: {
                          ...settings.content,
                          groupGuideTexts: { ...settings.content.groupGuideTexts, [g]: e.target.value },
                        },
                      })
                    }
                    rows={3}
                    placeholder={`分组 ${g} 引导文案`}
                    className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveSiteSettings}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
              >
                保存站点配置
              </button>
              <button
                type="button"
                onClick={resetSiteSettings}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200"
              >
                恢复默认
              </button>
              <button
                type="button"
                onClick={exportSiteSettingsJson}
                className="rounded-lg border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-300"
              >
                导出 JSON
              </button>
              <label className="cursor-pointer rounded-lg border border-cyan-500/40 px-4 py-2 text-sm font-semibold text-cyan-300">
                导入 JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void importSiteSettingsJsonFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={exportExperimentTemplateJson}
                className="rounded-lg border border-fuchsia-500/40 px-4 py-2 text-sm font-semibold text-fuchsia-300"
              >
                导出实验模板 JSON
              </button>
              <button
                type="button"
                onClick={exportExperimentTemplateCsv}
                className="rounded-lg border border-violet-500/40 px-4 py-2 text-sm font-semibold text-violet-300"
              >
                导出实验模板 CSV
              </button>
              <label className="cursor-pointer rounded-lg border border-sky-500/40 px-4 py-2 text-sm font-semibold text-sky-300">
                导入实验模板（JSON/CSV）
                <input
                  type="file"
                  accept="application/json,.json,text/csv,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void importExperimentTemplateFile(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">站点配置快照与回滚</h3>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  value={snapshotNote}
                  onChange={(e) => setSnapshotNote(e.target.value)}
                  placeholder="快照备注（可选）"
                  className="w-64 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={createSettingsSnapshot}
                  className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-300"
                >
                  创建快照
                </button>
              </div>
              <div className="space-y-2">
                {snapshots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border border-white/10 bg-slate-900/60 px-3 py-2">
                    <div className="text-xs text-slate-300">
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      <span className="ml-2 text-slate-400">{s.note || "（无备注）"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void rollbackSettingsSnapshot(s.id)}
                      className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                    >
                      回滚到此版本
                    </button>
                  </div>
                ))}
                {snapshots.length === 0 && (
                  <p className="text-xs text-slate-400">暂无快照，建议在大改前先创建一个快照。</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">实时预览（未保存也会即时变化）</h3>
                <div className="inline-flex rounded-lg border border-white/10 bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("home")}
                    className={`px-3 py-1 text-xs ${previewTab === "home" ? "text-white" : "text-slate-400"}`}
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("experiment")}
                    className={`px-3 py-1 text-xs ${previewTab === "experiment" ? "text-white" : "text-slate-400"}`}
                  >
                    实验
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("notices")}
                    className={`px-3 py-1 text-xs ${previewTab === "notices" ? "text-white" : "text-slate-400"}`}
                  >
                    提示页
                  </button>
                </div>
              </div>
              <div className="mx-auto w-full max-w-[320px] rounded-[28px] border border-white/10 p-3 shadow-lg">
                <div
                  className="overflow-hidden rounded-[20px] border"
                  style={{
                    borderColor: settings.theme.borderColor,
                    backgroundColor: settings.theme.bgColor,
                    color: settings.theme.textColor,
                    fontSize: `${settings.theme.baseFontSizePx}px`,
                  }}
                >
                  <div className="border-b px-3 py-2 text-center text-xs" style={{ borderColor: settings.theme.borderColor }}>
                    {settings.content.siteName}
                  </div>
                  <div className="space-y-3 p-3">
                    {previewTab === "home" && (
                      <>
                        <div
                          className="rounded-lg border p-3"
                          style={{
                            borderColor: settings.theme.borderColor,
                            backgroundColor: settings.theme.cardColor,
                          }}
                        >
                          <div className="text-base font-bold">{settings.content.homeTitle}</div>
                          <div className="mt-1 text-xs opacity-80">{settings.content.homeSubtitle}</div>
                        </div>
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
                          style={{
                            backgroundColor: settings.theme.primaryColor,
                            color: settings.theme.primaryTextColor,
                          }}
                        >
                          按钮预览
                        </button>
                        <div className="pt-1 text-center text-[11px] opacity-70">
                          {settings.content.footerText}
                        </div>
                      </>
                    )}

                    {previewTab === "experiment" && (
                      <>
                        <div className="rounded-lg bg-black/40 p-2 text-xs opacity-90">
                          {settings.content.cameraHint}
                        </div>
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
                          style={{
                            backgroundColor: settings.theme.primaryColor,
                            color: settings.theme.primaryTextColor,
                          }}
                        >
                          拍照
                        </button>
                        <div className="rounded-lg border p-2 text-xs" style={{ borderColor: settings.theme.borderColor }}>
                          <div className="font-medium">{settings.content.loadingTitle}</div>
                          <div className="mt-1 opacity-80">{settings.content.loadingSubtitle}</div>
                        </div>
                      </>
                    )}

                    {previewTab === "notices" && (
                      <>
                        <div
                          className="rounded-lg border p-3"
                          style={{
                            borderColor: settings.theme.borderColor,
                            backgroundColor: settings.theme.cardColor,
                          }}
                        >
                          <div className="text-base font-bold">
                            {settings.flow.notices.find((n) => n.enabled)?.title || "提示"}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm opacity-90">
                            {settings.flow.notices.find((n) => n.enabled)?.body || "（你可以在下方新增并编辑提示页）"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
                          style={{
                            backgroundColor: settings.theme.primaryColor,
                            color: settings.theme.primaryTextColor,
                          }}
                        >
                          继续
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">可插入的提示页（纯文字）</h3>
                <button
                  type="button"
                  onClick={addNotice}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  新增提示页
                </button>
              </div>
              <div className="space-y-3">
                {settings.flow.notices.map((n, idx) => (
                  <div key={n.id} className="rounded-lg border border-white/10 bg-slate-950 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-400">#{idx + 1}</div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-300">
                          启用
                          <input
                            type="checkbox"
                            className="ml-2 align-middle"
                            checked={n.enabled}
                            onChange={(e) => updateNotice(n.id, { enabled: e.target.checked })}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => moveNotice(n.id, -1)}
                          className="rounded border border-white/10 px-2 py-1 text-xs text-slate-200"
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          onClick={() => moveNotice(n.id, 1)}
                          className="rounded border border-white/10 px-2 py-1 text-xs text-slate-200"
                        >
                          下移
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNotice(n.id)}
                          className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
                      <select
                        value={n.placement}
                        onChange={(e) => updateNotice(n.id, { placement: e.target.value as SiteSettings["flow"]["notices"][number]["placement"] })}
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white"
                      >
                        <option value="beforeCamera">拍照前</option>
                        <option value="beforeResult">出结果前</option>
                        <option value="beforeSurvey">进入问卷前</option>
                        <option value="beforeHomeLogin">首页登录前</option>
                      </select>
                      <input
                        value={n.title}
                        onChange={(e) => updateNotice(n.id, { title: e.target.value })}
                        placeholder="标题"
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white md:col-span-2"
                      />
                      <textarea
                        value={n.body}
                        onChange={(e) => updateNotice(n.id, { body: e.target.value })}
                        placeholder="正文（支持换行）"
                        rows={4}
                        className="rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white md:col-span-3"
                      />
                    </div>
                  </div>
                ))}
                {settings.flow.notices.length === 0 && (
                  <p className="text-xs text-slate-400">还没有提示页。点击“新增提示页”开始。</p>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                提示页会按列表顺序依次插入到你选择的位置。编辑完成后记得点上面的“保存站点配置”。
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">加载站点配置中...</p>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">新增名单</h2>
        <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-4">
          <input
            required
            placeholder="姓名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
          />
          <input
            required
            placeholder="编号"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
          />
          <input
            required
            placeholder="分组"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white"
          >
            新增
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">批量导入（CSV 文本）</h2>
        <p className="mb-2 text-xs text-slate-400">
          支持粘贴 `姓名,编号,分组`（可带表头）；重复编号会自动跳过。
        </p>
        <form onSubmit={handleImportCsv} className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void handleImportCsvFile(file);
            }}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-300"
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            placeholder={"姓名,编号,分组\n张三,2026001,1\n李四,2026002,2"}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            批量导入
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            名单列表（{filtered.length}）
          </h2>
          <input
            placeholder="搜索 姓名/编号/分组"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
          />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-3">
          <span className="text-xs text-slate-400">已选 {selectedIds.length} 条</span>
          <button
            type="button"
            onClick={() => toggleSelectAllFiltered(!allFilteredSelected)}
            className="rounded border border-white/20 px-2 py-1 text-xs text-slate-200"
          >
            {allFilteredSelected ? "取消全选当前筛选" : "全选当前筛选"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="rounded border border-white/20 px-2 py-1 text-xs text-slate-300"
          >
            清空选择
          </button>
          <input
            placeholder="目标分组"
            value={bulkGroup}
            onChange={(e) => setBulkGroup(e.target.value)}
            className="w-28 rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
          />
          <button
            type="button"
            onClick={handleBatchUpdateGroup}
            className="rounded border border-cyan-500/40 px-2 py-1 text-xs text-cyan-300"
          >
            批量改组
          </button>
          <input
            placeholder="允许次数"
            id="bulkAllowedEntries"
            type="number"
            min="0"
            className="w-28 rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
          />
          <button
            type="button"
            onClick={async () => {
              const input = document.getElementById('bulkAllowedEntries') as HTMLInputElement;
              const allowedEntries = parseInt(input.value);
              if (isNaN(allowedEntries) || allowedEntries < 0) {
                setError('请输入有效的允许次数');
                return;
              }
              if (selectedIds.length === 0) {
                setError('请先选择要批量修改的账号');
                return;
              }
              const res = await fetch('/api/admin/whitelist', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'batchUpdateAllowedEntries', ids: selectedIds, allowedEntries }),
              });
              const data = await res.json();
              if (data.ok) {
                await refreshEntries();
                setError(`批量更新完成：更新 ${data.updated.changed} 条，跳过 ${data.updated.skipped} 条`);
                setSelectedIds([]);
                input.value = '';
              } else {
                setError(data.message || '批量更新失败');
              }
            }}
            className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-300"
          >
            批量设置允许次数
          </button>
          <button
            type="button"
            onClick={handleBatchDelete}
            className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300"
          >
            批量删除
          </button>
        </div>
        {error && <p className="mb-3 rounded bg-rose-950/80 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-300">
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                  />
                </th>
                <th className="px-3 py-2 text-left">姓名</th>
                <th className="px-3 py-2 text-left">编号</th>
                <th className="px-3 py-2 text-left">分组</th>
                <th className="px-3 py-2 text-left">允许次数</th>
                <th className="px-3 py-2 text-left">已用次数</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-white/5 text-slate-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(e.id)}
                      onChange={(ev) => toggleSelectOne(e.id, ev.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {editingId === e.id ? (
                      <input
                        value={editingName}
                        onChange={(ev) => setEditingName(ev.target.value)}
                        className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-white"
                      />
                    ) : (
                      e.name
                    )}
                  </td>
                  <td className="px-3 py-2">{e.id}</td>
                  <td className="px-3 py-2">
                    {editingId === e.id ? (
                      <input
                        value={editingGroup}
                        onChange={(ev) => setEditingGroup(ev.target.value)}
                        className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-white"
                      />
                    ) : (
                      e.group
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const newCount = Math.max(0, (e.allowedEntries || 2) - 1);
                          const res = await fetch('/api/admin/whitelist', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'updateAllowedEntries', id: e.id, allowedEntries: newCount }),
                          });
                          const data = await res.json();
                          if (data.ok) {
                            await refreshEntries();
                          } else {
                            setError(data.message || '更新失败');
                          }
                        }}
                        className="rounded border border-white/20 px-1 py-0.5 text-xs text-slate-300"
                      >
                        -
                      </button>
                      <span>{e.allowedEntries || 2}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const newCount = (e.allowedEntries || 2) + 1;
                          const res = await fetch('/api/admin/whitelist', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'updateAllowedEntries', id: e.id, allowedEntries: newCount }),
                          });
                          const data = await res.json();
                          if (data.ok) {
                            await refreshEntries();
                          } else {
                            setError(data.message || '更新失败');
                          }
                        }}
                        className="rounded border border-white/20 px-1 py-0.5 text-xs text-slate-300"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {e.actualEntries || 0}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingId === e.id ? (
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-300"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded border border-white/20 px-2 py-1 text-slate-300"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(e)}
                          className="rounded border border-cyan-500/40 px-2 py-1 text-cyan-300"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="rounded border border-rose-500/40 px-2 py-1 text-rose-300"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-400" colSpan={5}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">最近操作日志</h2>
          <button
            type="button"
            onClick={handleExportAuditsCsv}
            className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-300"
          >
            导出 CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-300">
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">管理员</th>
                <th className="px-3 py-2 text-left">动作</th>
                <th className="px-3 py-2 text-left">编号</th>
                <th className="px-3 py-2 text-left">详情</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a, idx) => (
                <tr key={`${a.createdAt}-${a.targetId}-${idx}`} className="border-b border-white/5 text-slate-100">
                  <td className="px-3 py-2">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{a.actor}</td>
                  <td className="px-3 py-2">{a.action}</td>
                  <td className="px-3 py-2">{a.targetId}</td>
                  <td className="px-3 py-2">{a.detail}</td>
                </tr>
              ))}
              {audits.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-400" colSpan={5}>
                    暂无日志
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
