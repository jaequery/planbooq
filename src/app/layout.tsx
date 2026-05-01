import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AiPanel } from "@/components/ai-panel/ai-panel";
import { AiPanelProvider } from "@/components/ai-panel/ai-panel-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Planbooq",
  description: "Linear-style issue tracker for vibe coders, native to Claude Code.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AiPanelProvider>
            <div style={{ paddingBottom: "var(--ai-panel-height, 48px)" }}>{children}</div>
            <AiPanel />
          </AiPanelProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
