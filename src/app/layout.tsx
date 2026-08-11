import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Axiom — Autonomous Research Orchestrator",
  description:
    "Multi-agent AI research system with x402 micropayments on Base Sepolia. Submit a query and watch autonomous agents search, verify, and compile comprehensive reports with full transparency.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("h-full dark", "antialiased", inter.variable, "font-sans")} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
