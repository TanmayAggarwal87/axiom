"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { QueryInput } from "@/components/research/QueryInput";
import { useWallet } from "@/components/wallet/WalletContext";
import { toast } from "sonner";

export default function Home() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { credits, openWallet } = useWallet();
  const [startLoading, setStartLoading] = useState(false);

  async function handleStartResearch(query: string, budgetUsdc: number) {
    if (!isSignedIn) {
      toast.error("Authentication required", {
        description: "Please sign in to start research sessions.",
      });
      return;
    }

    setStartLoading(true);
    try {
      const res = await fetch("/api/research/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          budgetUsdc,
        }),
      });
      const data = await res.json();

      if (data.success && data.sessionId) {
        toast.success("Research session started", {
          description: `Redirecting to session page...`,
        });
        router.push(`/research/${data.sessionId}`);
      } else {
        toast.error("Failed to start research", {
          description: data.error || "Unknown error",
        });
      }
    } catch (err: any) {
      toast.error("Network error", {
        description: err.message,
      });
    } finally {
      setStartLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <QueryInput
        credits={credits}
        onStartResearch={handleStartResearch}
        loading={startLoading}
        onOpenWallet={openWallet}
      />

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto mt-auto pt-12 text-center text-xs text-muted-foreground/30 flex items-center justify-between border-t border-border/5">
        <span>Axiom — Autonomous Research Orchestrator</span>
        <span>x402 Micropayments · Base Sepolia Testnet</span>
      </footer>
    </div>
  );
}
