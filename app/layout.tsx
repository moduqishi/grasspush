import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrassPush - 可爱又强大的消息推送服务",
  description: "GrassPush 是一个可爱又强大的消息推送服务，支持多种消息推送渠道，包括钉钉机器人、企业微信应用等",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={cn(
        geistSans.variable,
        geistMono.variable,
        "min-h-screen bg-background antialiased",
      )}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
