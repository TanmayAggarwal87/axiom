"use client";

import Link from "next/link";
import { useAuth, useUser, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { CreditWalletModal } from "@/components/wallet/CreditWalletModal";
import { useWallet } from "@/components/wallet/WalletContext";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  Activity,
  Hexagon,
  RotateCw,
  LogIn,
  UserPlus,
} from "lucide-react";

export function Navbar() {
  const { isLoaded, isSignedIn } = useAuth();
  const { credits, setCredits, refreshing, refreshBalance, walletRef } = useWallet();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/20 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div className="rounded-lg bg-foreground p-1.5">
            <Hexagon className="h-4 w-4 text-background" />
          </div>
          <span className="font-bold text-lg tracking-tight">Axiom</span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground border border-border/30 rounded-full px-2 py-0.5">
            <Activity className="h-2.5 w-2.5 text-emerald-400" />
            Base Sepolia
          </span>
        </Link>

        {/* User & Wallet Controls */}
        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <>
              <CreditWalletModal
                credits={credits}
                onTopUp={(newBalance) => {
                  setCredits(newBalance);
                }}
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
              <div className="ml-1 flex items-center">
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox: "h-8 w-8 rounded-lg border border-border/30",
                    },
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm" className="gap-1.5 bg-foreground text-background hover:bg-foreground/90 cursor-pointer">
                  <UserPlus className="h-4 w-4" />
                  Get Started
                </Button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
