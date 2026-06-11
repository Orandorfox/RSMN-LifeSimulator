"use client";

import { useExperiment } from "@/context/ExperimentContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "consent" | "login";
type UiSettings = {
  theme?: {
    primaryColor?: string;
    primaryTextColor?: string;
    baseFontSizePx?: number;
    baseFontWeight?: number;
  };
  content?: {
    homeTitle?: string;
    homeSubtitle?: string;
    consentTitle?: string;
    contactEmail?: string;
    footerText?: string;
    consentIntro?: string;
    consentItemsText?: string;
    consentAgreementText?: string;
    noticeContactPrefix?: string;
  };
};

export default function HomePage() {
  const router = useRouter();
  const { setParticipant } = useExperiment();
  const [step, setStep] = useState<Step>("consent");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ui, setUi] = useState<UiSettings | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/site-settings");
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: UiSettings };
        setUi(data.settings || null);
      } catch {
        // ignore settings fetch errors
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        group?: string;
        token?: string;
        message?: string;
      };
      if (!data.ok || !data.group || !data.token) {
        setError(data.message || "信息错误或不在实验名单内，请联系研究人员");
        return;
      }
      // 先设置参与者信息，然后再导航
      setParticipant({
        name: name.trim(),
        id: id.trim(),
        group: data.group,
        token: data.token,
      });
      // 使用 setTimeout 确保状态更新完成后再导航
      setTimeout(() => {
        router.push("/experiment");
      }, 100);
    } catch (error) {
      console.error("提交错误:", error);
      setError("网络异常，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (step === "consent") {
    if (!ui) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 py-10" style={{ fontSize: '16px', fontWeight: '400' }}>
          <div className="text-center">
            <h2 className="mb-2 text-xl font-bold text-white">加载中...</h2>
            <p className="text-sm text-slate-300">请稍候</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-sm text-slate-300">
            <span>准备中</span>
            <div className="flex space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-slate-600"
                  style={{
                    animation: `pulse ${1.5}s infinite ease-in-out ${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </main>
      );
    }
    
    const consentLines = (ui?.content?.consentItemsText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-10" style={{ fontSize: `${ui?.theme?.baseFontSizePx || 16}px`, fontWeight: ui?.theme?.baseFontWeight || 400 }}>
        <h1 className="mb-6 text-center text-2xl font-bold text-white">
          {ui?.content?.consentTitle || "知情同意书"}
        </h1>
        
        
        <div className="mb-6 rounded-xl border border-white/10 bg-slate-900/50 p-6">
          <p className="mb-4 text-sm text-slate-300">
            {ui?.content?.consentIntro || "欢迎您参加本次研究，在开始前请您先阅读以下内容："}
          </p>
          
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-300">
            {consentLines.length > 0 ? (
              consentLines.map((line, idx) => <li key={`${line}-${idx}`}>{line}</li>)
            ) : (
              <li>请在后台配置“知情同意条款”内容。</li>
            )}
          </ol>
          
          <div className="mt-6 space-y-2 text-sm text-slate-400">
            <p>
              {ui?.content?.noticeContactPrefix || "若您有任何问题，请联系研究者，邮箱："}
              {ui?.content?.contactEmail || "***"}
            </p>
            <p className="font-medium text-slate-300">
              {ui?.content?.consentAgreementText || "若您同意上述内容，请点击下一步。"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setStep("login")}
          className="w-full rounded-xl py-3 text-base font-semibold cursor-pointer"
          style={{
            touchAction: 'manipulation',
            backgroundColor: ui?.theme?.primaryColor || "#059669",
            color: ui?.theme?.primaryTextColor || "#ffffff",
          }}
        >
          下一步
        </button>

        <p className="mt-8 text-center text-xs text-slate-500">
          {ui?.content?.footerText || "本应用仅用于学术研究。遇到问题请联系研究人员。"}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10" style={{ fontSize: `${ui?.theme?.baseFontSizePx || 16}px`, fontWeight: ui?.theme?.baseFontWeight || 400 }}>
      <h1 className="mb-2 text-center text-2xl font-bold text-white">
        {ui?.content?.homeTitle || "人生模拟器"}
      </h1>
      <p className="mb-8 text-center text-sm text-slate-400">
        {ui?.content?.homeSubtitle || "请输入姓名与学号"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-300">姓名</span>
          <input
            required
            autoComplete="name"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请保持信息准确"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-300">学号</span>
          <input
            required
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="请保持信息准确"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-rose-950/80 px-3 py-2 text-sm text-rose-200">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl py-3 text-base font-semibold disabled:opacity-60 cursor-pointer"
          style={{
            touchAction: 'manipulation',
            backgroundColor: ui?.theme?.primaryColor || "#059669",
            color: ui?.theme?.primaryTextColor || "#ffffff",
          }}
        >
          {loading ? "校验中…" : "提交"}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-slate-500">
        {ui?.content?.footerText || "本应用仅用于学术研究。遇到问题请联系研究人员。"}
      </p>
    </main>
  );
}