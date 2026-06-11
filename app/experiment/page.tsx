"use client";

/**
 * 实验主流程：摄像头 → 生成中（全屏阻塞）→ 结果全屏图 + 分组文案 → 腾讯问卷 iframe
 *
 * Qwen 调用走 /api/generate，密钥仅在服务端 .env.local。
 */

import { CameraCapture, type CameraCapturePayload } from "@/components/CameraCapture";
import { useExperiment } from "@/context/ExperimentContext";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ResultLabelSet = {
  selfie: string;
  generated: string[];
  tail: string;
};

type Step = "camera" | "loading" | "result" | "notice" | "survey";
type UiSettings = {
  theme?: {
    primaryColor?: string;
    primaryTextColor?: string;
    baseFontSizePx?: number;
    baseFontWeight?: number;
  };
  content?: {
    siteName?: string;
    cameraHint?: string;
    loadingTitle?: string;
    loadingSubtitle?: string;
    cameraGuideTitle?: string;
    cameraGuideText?: string;
    cameraGuideImage?: string;
    contactEmail?: string;
    noticeContactPrefix?: string;
    noticeAgreeHint?: string;
    experimentExitText?: string;
    experimentNextButtonText?: string;
    surveyPageTitle?: string;
    surveyExitText?: string;
    defaultBeforeSurveyNoticeTitle?: string;
    defaultBeforeSurveyNoticeBody?: string;
    surveyUrls?: Record<string, string>;
    groupGuideTexts?: Record<string, string>;
    resultLabelsByGroup?: Record<
      string,
      { selfie?: string; generated1?: string; generated2?: string; tail?: string }
    >;
  };
  flow?: {
    notices?: Array<{
      id: string;
      placement: "beforeCamera" | "beforeResult" | "beforeSurvey" | "beforeHomeLogin";
      title: string;
      body: string;
      enabled: boolean;
    }>;
  };
};

export default function ExperimentPage() {
  const router = useRouter();
  const { participant, hydrateFromStorage } = useExperiment();
  const [step, setStep] = useState<Step | null>(null);
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [ui, setUi] = useState<UiSettings | null>(null);
  const pendingCaptureRef = useRef<CameraCapturePayload | null>(null);

  type NoticeItem = NonNullable<
    NonNullable<UiSettings["flow"]>["notices"]
  >[number];
  const [noticeQueue, setNoticeQueue] = useState<NoticeItem[]>([]);
  const [noticeIndex, setNoticeIndex] = useState(0);
  const [noticeReturnStep, setNoticeReturnStep] = useState<Step>("camera");

  const activeNotice = useMemo<NoticeItem | null>(() => {
    return noticeQueue[noticeIndex] || null;
  }, [noticeIndex, noticeQueue]);

  const defaultBeforeSurveyNotice = useMemo(() => {
    return {
      id: "default-before-survey",
      placement: "beforeSurvey" as const,
      title: ui?.content?.defaultBeforeSurveyNoticeTitle || "注意",
      body: ui?.content?.defaultBeforeSurveyNoticeBody || "",
      enabled: true,
    };
  }, [ui?.content?.defaultBeforeSurveyNoticeBody, ui?.content?.defaultBeforeSurveyNoticeTitle]);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/site-settings");
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: UiSettings };
        setUi(data.settings || null);
      } catch {
        // ignore
      }
    })();
  }, []);

  const startNotices = useCallback(
    (placement: "beforeCamera" | "beforeResult" | "beforeSurvey", returnStep: Step) => {
      const configured = 
        ui?.flow?.notices?.filter((n) => n.enabled && n.placement === placement) ||
        [];
      let list = 
        configured.length > 0
          ? configured
          : placement === "beforeSurvey"
            ? [defaultBeforeSurveyNotice]
            : [];
      
      // 确保拍照前引导页面始终显示，即使没有配置
      if (placement === "beforeCamera" && list.length === 0) {
        list = [{
          id: "camera-guide",
          placement: "beforeCamera",
          title: ui?.content?.cameraGuideTitle || "拍照提示",
          body: ui?.content?.cameraGuideText || "接下来您将进入到拍照环节，请您不要遮挡脸部，也不要佩戴帽子或墨镜，确保背景纯净且没有其他人入镜，如下图所示：",
          enabled: true
        }];
      }
      
      if (list.length === 0) return false;
      setNoticeQueue(list);
      setNoticeIndex(0);
      setNoticeReturnStep(returnStep);
      setStep("notice");
      return true;
    },
    [defaultBeforeSurveyNotice, ui?.flow?.notices, ui?.content?.cameraGuideTitle, ui?.content?.cameraGuideText],
  );

  // 首次进入实验页：如果配置了“拍照前提示页”，先显示
  useEffect(() => {
    if (!ui) return;
    // 直接设置step为notice，避免先显示camera页面
    const configured = 
      ui?.flow?.notices?.filter((n) => n.enabled && n.placement === "beforeCamera") ||
      [];
    let list = 
      configured.length > 0
        ? configured
        : [];
    
    // 确保拍照前引导页面始终显示，即使没有配置
    if (list.length === 0) {
      list = [{
        id: "camera-guide",
        placement: "beforeCamera" as const,
        title: ui?.content?.cameraGuideTitle || "拍照提示",
        body: ui?.content?.cameraGuideText || "接下来您将进入到拍照环节，请您不要遮挡脸部，也不要佩戴帽子或墨镜，确保背景纯净且没有其他人入镜，如下图所示：",
        enabled: true
      }];
    }
    
    if (list.length > 0) {
      setNoticeQueue(list);
      setNoticeIndex(0);
      setNoticeReturnStep("camera");
      setStep("notice");
    } else {
      setStep("camera");
    }
  }, [ui]);

  useEffect(() => {
    if (!participant) {
      router.replace("/");
    }
  }, [participant, router]);

  const onCapture = useCallback(
    async (payload: CameraCapturePayload) => {
      // 若配置了“出结果前提示页”，先展示提示页，继续后再真正开始生成
      if (startNotices("beforeResult", "loading")) {
        pendingCaptureRef.current = payload;
        setSelfieUrl(payload.dataUrl);
        return;
      }

      setStep("loading");
      setFatalError(null);
      setSelfieUrl(payload.dataUrl);

      try {
        const controller = new AbortController();
        const t = window.setTimeout(() => controller.abort(), 45_000);
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${participant?.token ?? ""}`,
          },
          body: JSON.stringify({
            imageBase64: payload.dataUrl,
            mimeType: payload.mimeType,
            group: participant?.group,
          }),
          signal: controller.signal,
        });
        window.clearTimeout(t);

        const data = (await res.json()) as {
          ok?: boolean;
          imageUrl?: string;
          imageUrls?: string[];
          message?: string;
          _debug?: {
            code?: string;
            hint?: string;
            dashscopeMessage?: string;
            dashscopeCode?: string;
            httpStatus?: number;
            requestId?: string;
            outputPreview?: string;
          };
        };

        if (!data.ok || (!data.imageUrl && !data.imageUrls)) {
          const d = data._debug;
          const devHint =
            d &&
            `[开发诊断 ${d.code ?? "?"}] ${d.dashscopeMessage ?? ""} ${d.hint ?? ""} ${d.httpStatus != null ? `HTTP ${d.httpStatus}` : ""} ${d.requestId ? `req:${d.requestId}` : ""}`.trim();
          setFatalError(
            (data.message ||
              `当前使用人数较多，请稍后重试，感谢您的耐心。如果还是不行，请联系研究人员。`) +
              (devHint ? `\n${devHint}` : ""),
          );
          setStep("camera");
          return;
        }
        if (data.imageUrls && data.imageUrls.length > 0) {
          setGeneratedUrls(data.imageUrls);
        } else if (data.imageUrl) {
          setGeneratedUrls([data.imageUrl]);
        }
        setStep("result");
      } catch {
        setFatalError(
          `当前使用人数较多，请稍后重试，感谢您的耐心。如果还是不行，请联系研究人员。`,
        );
        setStep("camera");
      }
    },
    [participant?.group, participant?.token, startNotices],
  );

  const proceedNotice = useCallback(async () => {
    if (noticeIndex + 1 < noticeQueue.length) {
      setNoticeIndex((i) => i + 1);
      return;
    }
    setNoticeQueue([]);
    setNoticeIndex(0);
    const next = noticeReturnStep;
    setStep(next);
    if (next === "loading" && pendingCaptureRef.current) {
      const p = pendingCaptureRef.current;
      pendingCaptureRef.current = null;
      await onCapture(p);
    }
  }, [noticeIndex, noticeQueue.length, noticeReturnStep, onCapture]);

  if (!participant) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">
        跳转中…
      </div>
    );
  }

  const guide =
    ui?.content?.groupGuideTexts?.[participant.group] ||
    ui?.content?.groupGuideTexts?.default ||
    "请仔细观察生成的照片，并在完成上述要求后进行下一步。";
  const labelSource =
    ui?.content?.resultLabelsByGroup?.[participant.group] ||
    ui?.content?.resultLabelsByGroup?.default;
  const resultLabels: ResultLabelSet = {
    selfie: labelSource?.selfie || "这是你的自拍照片",
    generated: [labelSource?.generated1 || "生成照片1", labelSource?.generated2 || "生成照片2"],
    tail: labelSource?.tail || guide,
  };
  const surveyUrl =
    ui?.content?.surveyUrls?.[participant.group] ||
    ui?.content?.surveyUrls?.default ||
    "***";

  return (
    <main className="relative min-h-dvh" style={{ fontSize: `${ui?.theme?.baseFontSizePx || 16}px`, fontWeight: ui?.theme?.baseFontWeight || 400 }}>
      {/* 顶部极简导航：实验过程中尽量不打扰；加载时仍可显示但无返回按钮 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <span className="text-sm font-medium text-slate-300">
          {ui?.content?.siteName || "人生模拟器"}
        </span>
        {step !== "loading" && (
          <Link href="/" className="text-xs text-slate-500 underline">
            {ui?.content?.experimentExitText || "退出"}
          </Link>
        )}
      </header>

      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-6">
        {step === null && (
          <div className="flex h-full flex-col items-center justify-center">
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
          </div>
        )}
        
        {step === "camera" && (
          <>
            <p className="mb-4 text-center text-sm text-slate-400">
              {ui?.content?.cameraHint || "请授予前置摄像头权限，点击拍照按钮开始拍照。"}
            </p>
            {fatalError && (
              <p className="mb-4 w-full rounded-lg bg-rose-950/80 px-3 py-2 text-center text-sm text-rose-200">
                {fatalError}
              </p>
            )}
            <CameraCapture onCapture={onCapture} />
          </>
        )}

        {step === "result" && generatedUrls.length > 0 && (
          <div className="w-full bg-black">
            <div className="w-full flex flex-col">
              {selfieUrl && (
                <div className="w-full bg-black">
                  <div className="text-sm font-medium text-slate-400 p-4">{resultLabels.selfie}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selfieUrl}
                    alt={resultLabels.selfie}
                    className="block w-full h-auto object-contain"
                  />
                </div>
              )}

              <div className={`w-full ${generatedUrls.length > 1 ? "grid gap-4 p-4 md:grid-cols-2" : ""}`}>
                {generatedUrls.map((url, index) => {
                  const generatedLabel =
                    resultLabels.generated[index] || `生成照片${index + 1}`;
                  return (
                    <div key={index} className="w-full bg-black">
                      <div className="text-sm font-medium text-slate-400 p-4">{generatedLabel}</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={generatedLabel}
                        className="block w-full h-auto object-contain"
                      />
                    </div>
                  );
                })}
              </div>

              {/* 引导文案和下一步按钮 */}
              <div className="w-full bg-slate-950 border-t border-white/10 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <p className="text-center text-base leading-relaxed text-slate-200 mb-6">
                  {resultLabels.tail || guide}
                </p>
                <button
                  type="button"
                  className="w-full rounded-xl py-3 text-base font-semibold cursor-pointer"
                  onClick={() => startNotices("beforeSurvey", "survey")}
                  style={{
                    touchAction: 'manipulation',
                    backgroundColor: ui?.theme?.primaryColor || "#059669",
                    color: ui?.theme?.primaryTextColor || "#ffffff",
                  }}
                >
                  {ui?.content?.experimentNextButtonText || "下一步"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "notice" && activeNotice && (
          <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="w-full max-w-2xl mx-auto">
                <h2 className="mb-6 text-center text-xl font-bold text-white">
                  {activeNotice.title || "提示"}
                </h2>
                
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
                  <div className="whitespace-pre-wrap text-sm text-slate-300">
                    {activeNotice.body}
                  </div>
                  
                  {activeNotice.placement === 'beforeCamera' && (
                    <div className="mt-6 flex justify-center">
                      <Image 
                        src={`/${ui?.content?.cameraGuideImage || 'shotguide.jpg'}`} 
                        alt="拍照示例" 
                        width={600} 
                        height={400} 
                        className="max-w-full h-auto rounded-lg"
                      />
                    </div>
                  )}
                  
                  <div className="mt-6 space-y-2 text-sm text-slate-400">
                    <p>
                      {ui?.content?.noticeContactPrefix || "若您有任何问题，请联系研究者，邮箱："}
                      {ui?.content?.contactEmail || "***"}
                    </p>
                    <p className="font-medium text-slate-300">
                      {ui?.content?.noticeAgreeHint || "若您同意上述内容，请点击下一步。"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-slate-950 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto w-full max-w-2xl">
                <button
                  type="button"
                  className="w-full rounded-xl py-3 text-base font-semibold cursor-pointer"
                  onClick={() => void proceedNotice()}
                  style={{
                    touchAction: 'manipulation',
                    backgroundColor: ui?.theme?.primaryColor || "#059669",
                    color: ui?.theme?.primaryTextColor || "#ffffff",
                  }}
                >
                  {ui?.content?.experimentNextButtonText || "下一步"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "survey" && (
          <div className="fixed inset-0 z-40 flex flex-col bg-white">
            {/* 简化的顶部导航 */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <span className="text-sm font-medium text-gray-800">
                {ui?.content?.surveyPageTitle || "问卷填写"}
              </span>
              <Link href="/" className="text-xs text-gray-500 underline">
                {ui?.content?.surveyExitText || "退出"}
              </Link>
            </header>
            
            {/* 问卷内容 */}
            <div className="flex-1 overflow-hidden">
              <iframe
                id="idy_frame"
                title="腾讯问卷"
                src={surveyUrl}
                height="100%"
                width="100%"
                frameBorder={0}
                className="h-full w-full"
                allowFullScreen
                sandbox="allow-same-origin allow-scripts allow-modals allow-downloads allow-forms allow-popups"
              />
            </div>
          </div>
        )}
      </div>

      {/* 全局加载遮罩：不可取消、不可返回（header 已在 loading 时隐藏返回类操作） */}
      {step === "loading" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 px-6 text-center">
          <div className="mb-6 h-12 w-12 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-lg font-medium text-white">
            {ui?.content?.loadingTitle || "请耐心等待图片生成..."}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {ui?.content?.loadingSubtitle || "请勿关闭页面，预计不超过10 秒，生成完毕后请按要求观察图片"}
          </p>
        </div>
      )}
    </main>
  );
}