import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Zap,
} from "lucide-react";

const SAMPLE_QUERIES = [
  "Research the Neem plant, especially its medicinal uses, risks, and recent scientific research",
  "CRISPR gene editing: therapeutic potential, safety risks, and regulatory landscape",
  "Benefits and risks of intermittent fasting backed by scientific evidence",
  "Recent breakthroughs in quantum computing and practical applications",
];

const LOADING_STATUSES = [
  "Initializing core planner...",
  "Spawning research agents...",
  "Deploying academic & safety streams...",
  "Decomposing query dependencies...",
  "Launching agents in background...",
  "Compiling findings, please wait...",
];

interface QueryInputProps {
  credits: number;
  onStartResearch: (query: string, budgetUsdc: number) => void;
  loading: boolean;
  onOpenWallet: () => void;
}

export function QueryInput({ credits, onStartResearch, loading, onOpenWallet }: QueryInputProps) {
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState(0.5);
  const [statusIndex, setStatusIndex] = useState(0);

  const insufficientCredits = credits < budget;

  useEffect(() => {
    if (!loading) {
      setStatusIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setStatusIndex((prev) => {
        if (prev < LOADING_STATUSES.length - 1) {
          return prev + 1;
        }
        return prev; // Lock at the last element
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading || insufficientCredits) return;
    onStartResearch(query.trim(), budget);
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/30 bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          
          Autonomous Multi-Agent Research with x402 Micropayments
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
          What would you like to research?
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
          Submit a query and watch autonomous agents search, verify, and compile a comprehensive report with full transparency.
        </p>
      </div>

      {/* Input Card */}
      <Card className="border-border/30 bg-card/50 backdrop-blur-sm p-1 shadow-xl shadow-black/5">
        <form onSubmit={handleSubmit} className="space-y-0">
          <div className="relative">
            <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground/50" />
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe your research topic in detail..."
              className="w-full resize-none rounded-t-xl border-0 bg-transparent px-12 py-4 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0 min-h-[100px]"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/20 px-4 py-3">
            {/* Budget Slider */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground whitespace-nowrap">Budget:</span>
              <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.1"
                value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value))}
                className="w-24 accent-emerald-500 cursor-pointer"
              />
              <span className="font-mono font-semibold text-emerald-500 min-w-[60px]">
                ${budget.toFixed(2)}
              </span>
            </div>

            <Button
              type="submit"
              disabled={!query.trim() || loading || insufficientCredits}
              className="bg-foreground text-background hover:bg-foreground/90 gap-2 px-6 cursor-pointer transition-all duration-200 min-w-[280px] justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-emerald-400" />
                  <span className="animate-pulse text-xs tracking-wide">{LOADING_STATUSES[statusIndex]}</span>
                </>
              ) : (
                <>
                  Start Research
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Low Balance Warning */}
      {insufficientCredits && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-200/80">
              Insufficient credits (${credits.toFixed(2)}) for this budget (${budget.toFixed(2)}).
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenWallet}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 cursor-pointer ml-4"
            >
              Top Up Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Sample Queries */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground text-center">
          Try a sample query
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SAMPLE_QUERIES.map((sample, i) => (
            <button
              key={i}
              onClick={() => setQuery(sample)}
              className="text-left rounded-lg border border-border/20 bg-muted/10 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 hover:border-border/40 transition-all duration-200 cursor-pointer line-clamp-2"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
