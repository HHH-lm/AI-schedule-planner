import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppErrorBoundary from "@/components/AppErrorBoundary";

export const metadata: Metadata = {
  title: "AI 日程管理系统",
  description: "AI 拆解宏观计划，双视图落地微观执行",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI 日程",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f6f7f9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </body>
    </html>
  );
}
