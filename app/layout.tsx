import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedResearch AI",
  description: "AI clinical research document assistant.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white text-slate-950 antialiased">{children}</body>
    </html>
  );
}
