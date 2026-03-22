import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loft Section Generator",
  description: "Loft截面曲線產生工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
