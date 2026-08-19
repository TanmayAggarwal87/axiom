"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";

interface WalletContextType {
  credits: number;
  setCredits: React.Dispatch<React.SetStateAction<number>>;
  refreshing: boolean;
  refreshBalance: () => Promise<void>;
  walletRef: React.RefObject<HTMLButtonElement | null>;
  openWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [credits, setCredits] = useState<number>(10);
  const [refreshing, setRefreshing] = useState(false);
  const walletRef = useRef<HTMLButtonElement | null>(null);
  const isFetchingBalanceRef = useRef(false);

  const refreshBalance = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    if (isFetchingBalanceRef.current) return;
    isFetchingBalanceRef.current = true;
    setRefreshing(true);
    try {
      const r = await fetch("/api/wallet/balance");
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
  }, [isLoaded, isSignedIn]);

  const openWallet = useCallback(() => {
    if (!isSignedIn) {
      toast.info("Please sign in", {
        description: "You must be signed in to manage your wallet balance.",
      });
      return;
    }
    walletRef.current?.click();
  }, [isSignedIn]);

  // Initial balance check & Stripe redirect detection
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      refreshBalance();
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      const stripeSessionId = params.get("session_id");
      window.history.replaceState({}, "", "/");

      if (stripeSessionId) {
        (async () => {
          try {
            const res = await fetch("/api/stripe/verify-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: stripeSessionId,
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
                description: "Use the 'Instant Test Top-Up' button in the wallet to add credits.",
              });
            } else if (data.alreadyProcessed) {
              refreshBalance();
              toast.success("Payment already applied!", {
                description: `Balance refreshed.`,
              });
            }
          } catch {
            refreshBalance();
          }
        })();
      }
    }

    const handleFocus = () => {
      if (document.visibilityState === "visible" && isSignedIn) {
        refreshBalance();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refreshBalance, isLoaded, isSignedIn]);

  // Realtime Supabase Subscription
  useEffect(() => {
    if (!isSignedIn || !userId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("your-supabase")) {
      return;
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase
        .channel(`user-credits-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "users",
            filter: `id=eq.${userId}`,
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
  }, [refreshBalance, isSignedIn, userId]);

  return (
    <WalletContext.Provider value={{ credits, setCredits, refreshing, refreshBalance, walletRef, openWallet }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
