"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QueryInput } from "@/components/research/QueryInput";
import { LiveSessionView } from "@/components/research/LiveSessionView";
import { ReportView } from "@/components/report/ReportView";
import { CreditWalletModal } from "@/components/wallet/CreditWalletModal";
import type { SessionState } from "@/lib/orchestrator/types";
import { Toaster, toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import {
  Wallet,
  Activity,
  Hexagon,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AppPhase = "idle" | "running" | "completed";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [credits, setCredits] = useState<number>(10);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionQuery, setSessionQuery] = useState("");
  const [completedState, setCompletedState] = useState<SessionState | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const walletRef = useRef<HTMLButtonElement>(null);
  const isFetchingBalanceRef = useRef(false);

  // Authoritative balance refetch
  const refreshBalance = useCallback(async () => {
    if (isFetchingBalanceRef.current) return;
    isFetchingBalanceRef.current = true;
    setRefreshing(true);
    try {
      const r = await fetch("/api/wallet/balance?userId=default-user");
      const data = await r.json();
      if (data.success && typeof data.credits === "number") {
        setCredits(data.credits);
      }
    } catch (err) {
      console.error("Failed to refresh credit balance:", err);
    } finally {
      isFetchingBalanceRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // 1. Initial fetch + Stripe Checkout success detection + Tab Focus fallback
  useEffect(() => {
    refreshBalance();

    // Detect Stripe redirect: /?checkout=success&session_id=cs_test_...
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      const stripeSessionId = params.get("session_id");
      // Clean the URL immediately so a refresh doesn't re-trigger this
      window.history.replaceState({}, "", "/");

      if (stripeSessionId) {
        // Actively verify with Stripe and credit the user right now
        (async () => {
          try {
            const res = await fetch("/api/stripe/verify-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: stripeSessionId,
                userId: "default-user",
              }),
            });
            const data = await res.json();

            if (data.success && typeof data.credits === "number") {
              setCredits(data.credits);
              toast.success("Credits added!", {
                description: `Your balance is now $${data.credits.toFixed(2)} USDC`,
              });
            } else if (data.stripeNotConfigured) {
              toast.info("Stripe not fully configured", {
                description:
                  "Use the 'Instant Test Top-Up' button in the wallet to add credits.",
              });
            } else if (data.alreadyProcessed) {
              // Already credited via webhook — just refresh display
              refreshBalance();
              toast.success("Payment already applied!", {
                description: `Balance refreshed.`,
              });
            } else {
              // Payment not yet confirmed — poll balance for up to 30s
              toast.info("Payment received, applying credits…", {
                description: "This usually takes a few seconds.",
              });
              let attempts = 0;
              const poll = setInterval(async () => {
                await refreshBalance();
                attempts++;
                if (attempts >= 6) {
                  clearInterval(poll);
                  toast.info("Credits may take a moment to appear.", {
                    description: "Try refreshing the page if balance hasn't updated.",
                  });
                }
              }, 5000);
            }
          } catch {
            // Network error — fall back to balance refresh
            refreshBalance();
            toast.info("Payment confirmed!", {
              description: "Refreshing your credit balance…",
            });
          }
        })();
      } else {
        // No session_id in URL — just refresh balance (webhook will have handled it)
        refreshBalance();
        toast.success("Payment successful!", {
          description: "Your credits will appear shortly.",
        });
      }
    }

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        refreshBalance();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refreshBalance]);


  // 2. Supabase Realtime Subscription on authoritative 'users' table
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("your-supabase")) {
      return;
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase
        .channel("user-credits-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "users",
            filter: "id=eq.default-user",
          },
          (payload: any) => {
            if (payload.new && typeof payload.new.credits === "number") {
              setCredits(payload.new.credits);
              toast.info("Credit balance updated", {
                description: `New balance: $${payload.new.credits.toFixed(2)} USDC`,
              });
            } else {
              refreshBalance();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn("[Realtime] Failed to initialize Supabase Realtime:", err);
    }
  }, [refreshBalance]);

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
    refreshBalance();
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

          {/* Wallet & Refresh Affordance */}
          <div className="flex items-center gap-1.5">
            <CreditWalletModal
              credits={credits}
              onTopUp={(newBalance) => setCredits(newBalance)}
              onRefreshBalance={refreshBalance}
              refreshing={refreshing}
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
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshBalance}
              disabled={refreshing}
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Refresh credit balance"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
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
