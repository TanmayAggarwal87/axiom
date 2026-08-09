"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QueryInput } from "@/components/research/QueryInput";
import { LiveSessionView } from "@/components/research/LiveSessionView";
import { ReportView } from "@/components/report/ReportView";
import { CreditWalletModal } from "@/components/wallet/CreditWalletModal";
import type { SessionState } from "@/lib/orchestrator/types";
import { Toaster, toast } from "sonner";
import {
  Wallet,
  Activity,
  Hexagon,
} from "lucide-react";

type AppPhase = "idle" | "running" | "completed";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [credits, setCredits] = useState<number>(100);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionQuery, setSessionQuery] = useState("");
  const [completedState, setCompletedState] = useState<SessionState | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const walletRef = useRef<HTMLButtonElement>(null);

  // Fetch initial balance
  useEffect(() => {
    fetch("/api/wallet/balance?userId=default-user")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCredits(data.credits);
      })
      .catch(() => {});
  }, []);

  // Start research session
  async function handleStartResearch(query: string, budgetUsdc: number) {
    setStartLoading(true);
    try {
      const res = await fetch("/api/research/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          userId: "default-user",
          budgetUsdc,
        }),
      });
      const data = await res.json();

      if (data.success && data.sessionId) {
        setSessionId(data.sessionId);
        setSessionQuery(query);
        setPhase("running");
        toast.success("Research session started", {
          description: `Session ${data.sessionId.slice(0, 20)}...`,
        });

        // If the API returned finalState directly (synchronous execution),
        // move straight to completed
        if (data.finalState) {
          const tasks = data.finalState.tasks || [];
          const allDone = tasks.length > 0 && tasks.every(
            (t: any) => t.status === "done" || t.status === "failed"
          );
          if (allDone) {
            setCompletedState(data.finalState);
            setPhase("completed");
          }
        }
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

  const handleSessionComplete = useCallback((state: SessionState) => {
    setCompletedState(state);
    setPhase("completed");
    toast.success("Research complete!", {
      description: "Your report is ready to view.",
    });
  }, []);

  function handleNewResearch() {
    setPhase("idle");
    setSessionId(null);
    setSessionQuery("");
    setCompletedState(null);

    // Refresh credit balance
    fetch("/api/wallet/balance?userId=default-user")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCredits(data.credits);
      })
      .catch(() => {});
  }

  function handleOpenWallet() {
    walletRef.current?.click();
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          className: "border-border/30 bg-card/95 backdrop-blur-xl text-foreground",
        }}
      />

      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/20 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-foreground p-1.5">
              <Hexagon className="h-4 w-4 text-background" />
            </div>
            <span className="font-bold text-lg tracking-tight">Axiom</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground border border-border/30 rounded-full px-2 py-0.5">
              <Activity className="h-2.5 w-2.5 text-emerald-400" />
              Base Sepolia
            </span>
          </div>

          {/* Wallet */}
          <CreditWalletModal
            credits={credits}
            onTopUp={(newBalance) => setCredits(newBalance)}
            trigger={
              <button
                ref={walletRef}
                className="inline-flex items-center gap-2 rounded-lg border border-border/30 bg-card/50 backdrop-blur-sm px-3 py-1.5 text-sm hover:bg-accent/80 transition-all duration-200 cursor-pointer"
              >
                <Wallet className="h-4 w-4 text-emerald-500" />
                <span className="font-semibold">${credits.toFixed(2)}</span>
              </button>
            }
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 py-12">
        {phase === "idle" && (
          <QueryInput
            credits={credits}
            onStartResearch={handleStartResearch}
            loading={startLoading}
            onOpenWallet={handleOpenWallet}
          />
        )}

        {phase === "running" && sessionId && (
          <LiveSessionView
            sessionId={sessionId}
            onComplete={handleSessionComplete}
          />
        )}

        {phase === "completed" && completedState && (
          <ReportView
            state={completedState}
            query={sessionQuery}
            onNewResearch={handleNewResearch}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/10 py-4">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground/50">
          <span>Axiom — Autonomous Research Orchestrator</span>
          <span>x402 Micropayments · Base Sepolia Testnet</span>
        </div>
      </footer>
    </>
  );
}
