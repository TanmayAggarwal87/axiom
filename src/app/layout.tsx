import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { WalletProvider } from "@/components/wallet/WalletContext";
import { Navbar } from "@/components/layout/Navbar";
import { SessionSidebar } from "@/components/research/SessionSidebar";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Axiom — Autonomous Research Orchestrator",
  description:
    "Multi-agent AI research system with x402 micropayments on Base Sepolia. Submit a query and watch autonomous agents search, verify, and compile comprehensive reports with full transparency.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("h-full dark", "antialiased", inter.variable, "font-sans")} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground" suppressHydrationWarning>
        <ClerkProvider>
          <WalletProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                className: "border-border/30 bg-card/95 backdrop-blur-xl text-foreground",
              }}
            />
            <Navbar />
            <div className="flex-1 flex min-h-0 relative">
              <SessionSidebar />
              <main className="flex-1 flex flex-col min-h-0 relative overflow-y-auto">
                {children}
              </main>
            </div>
          </WalletProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

