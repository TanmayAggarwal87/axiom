"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, Plus, CheckCircle2, Loader2, RotateCw } from "lucide-react";

const TOP_UP_OPTIONS = [
  { amount: 5, label: "$5.00" },
  { amount: 10, label: "$10.00" },
  { amount: 25, label: "$25.00" },
  { amount: 50, label: "$50.00" },
];

interface CreditWalletModalProps {
  credits: number;
  onTopUp: (newBalance: number) => void;
  onRefreshBalance?: () => void;
  refreshing?: boolean;
  trigger?: React.ReactElement;
}

export function CreditWalletModal({
  credits,
  onTopUp,
  onRefreshBalance,
  refreshing,
  trigger,
}: CreditWalletModalProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleTopUp(useStripe = false) {
    if (!selected) return;
    setLoading(true);
    setSuccess(false);

    try {
      if (useStripe) {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "default-user",
            amountUsd: selected,
            successUrl: `${window.location.origin}/?checkout=success`,
            cancelUrl: `${window.location.origin}/?checkout=cancel`,
          }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }

      // Instant Topup Fallback or Default
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default-user", amount: selected }),
      });
      const data = await res.json();
      if (data.success) {
        onTopUp(data.newBalance);
        setSuccess(true);
        setTimeout(() => {
          setOpen(false);
          setSuccess(false);
          setSelected(null);
        }, 1500);
      }
    } catch (err) {
      console.error("Top-up failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger || (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-border/50 bg-card/50 backdrop-blur-sm hover:bg-accent/80 cursor-pointer transition-all duration-200"
            >
              <Wallet className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-sm">${credits.toFixed(2)}</span>
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md border-border/30 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-emerald-500" />
            Credit Wallet
          </DialogTitle>
          <DialogDescription>
            Top up your research credits. Used for x402 micropayments on Base Sepolia testnet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Current Balance */}
          <div className="relative rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
            {onRefreshBalance && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefreshBalance}
                disabled={refreshing}
                className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Refresh balance"
              >
                <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            )}
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Current Balance
            </p>
            <p className="text-3xl font-bold tracking-tight">
              ${credits.toFixed(2)}
              <span className="text-sm font-normal text-muted-foreground ml-1">USDC</span>
            </p>
          </div>

          {/* Top-Up Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Select top-up amount</p>
            <div className="grid grid-cols-2 gap-2">
              {TOP_UP_OPTIONS.map((opt) => (
                <button
                  key={opt.amount}
                  onClick={() => setSelected(opt.amount)}
                  className={`
                    relative rounded-lg border p-3 text-center transition-all duration-200 cursor-pointer
                    ${
                      selected === opt.amount
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
                        : "border-border/30 bg-muted/20 hover:border-border/60 hover:bg-muted/40"
                    }
                  `}
                >
                  <span className="text-lg font-semibold">{opt.label}</span>
                  {selected === opt.amount && (
                    <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          {success ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Top-up successful!</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={() => handleTopUp(true)}
                disabled={!selected || loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition-colors duration-200"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {loading
                  ? "Redirecting to Stripe..."
                  : selected
                    ? `Pay $${selected.toFixed(2)} via Stripe Checkout`
                    : "Select an amount"}
              </Button>

              <Button
                variant="outline"
                onClick={() => handleTopUp(false)}
                disabled={!selected || loading}
                className="w-full border-border/30 hover:bg-muted/30 text-xs cursor-pointer"
              >
                Instant Test Top-Up (Skip Stripe)
              </Button>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground">
            Stripe test mode · Base Sepolia testnet · No real charges
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
