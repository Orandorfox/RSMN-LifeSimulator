import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { ExperimentProvider } from "@/context/ExperimentContext";
import { readSiteSettings } from "@/lib/site-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "人生模拟器",
  description: "本网页仅供学术研究使用",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settingsPromise = readSiteSettings();
  return <RootLayoutAsync settingsPromise={settingsPromise}>{children}</RootLayoutAsync>;
}

async function RootLayoutAsync({
  children,
  settingsPromise,
}: Readonly<{
  children: React.ReactNode;
  settingsPromise: ReturnType<typeof readSiteSettings>;
}>) {
  const settings = await settingsPromise;
  return (
    <html lang="zh-CN">
      <body
        className="min-h-dvh"
        style={
          {
            "--theme-bg": settings.theme.bgColor,
            "--theme-text": settings.theme.textColor,
            "--theme-card": settings.theme.cardColor,
            "--theme-border": settings.theme.borderColor,
            "--theme-primary": settings.theme.primaryColor,
            "--theme-primary-text": settings.theme.primaryTextColor,
            "--theme-font-size": `${settings.theme.baseFontSizePx}px`,
          } as CSSProperties
        }
      >
        <ExperimentProvider>{children}</ExperimentProvider>
      </body>
    </html>
  );
}
