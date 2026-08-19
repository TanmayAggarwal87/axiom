"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PaymentProofPanel } from "@/components/payments/PaymentProofPanel";
import type { SessionState } from "@/lib/orchestrator/types";
import { compileReport, type CompiledReport } from "@/lib/report/compiler";
import { ReportPdfDocument } from "./ReportPdfDocument";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  BookOpen,
  ShieldAlert,
  Lightbulb,
  Coins,
  Search,
  ArrowLeft,
  FileDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Claim Status Badge ────────────────────────────────────────────────────────

const CLAIM_STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  supported: {
    icon: CheckCircle2,
    label: "Supported",
    variant: "default",
  },
  partially_supported: {
    icon: AlertTriangle,
    label: "Partially Supported",
    variant: "secondary",
  },
  unsupported: {
    icon: XCircle,
    label: "Unsupported",
    variant: "destructive",
  },
  insufficient_evidence: {
    icon: HelpCircle,
    label: "Insufficient Evidence",
    variant: "outline",
  },
};

const SECTION_ICONS: Record<string, React.ElementType> = {
  overview: BookOpen,
  findings: Search,
  academic: FileText,
  safety: ShieldAlert,
  limitations: Lightbulb,
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface ReportViewProps {
  state?: SessionState;
  query?: string;
  onNewResearch: () => void;
  precompiledReport?: CompiledReport;
}

export function ReportView({ state, query, onNewResearch, precompiledReport }: ReportViewProps) {
  const report = useMemo(() => {
    if (precompiledReport) return precompiledReport;
    if (state && query) return compileReport(state, query);
    throw new Error("ReportView: state and query, or precompiledReport must be provided.");
  }, [state, query, precompiledReport]);
  const [exportingPdf, setExportingPdf] = useState(false);

  async function handleExportPdf() {
    try {
      setExportingPdf(true);
      const blob = await pdf(<ReportPdfDocument report={report} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Axiom_Research_Report_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Report PDF downloaded successfully");
    } catch (err: any) {
      console.error("[ReportView] PDF generation failed:", err);
      toast.error("Failed to generate PDF", {
        description: err?.message || "PDF generation error",
      });
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Report Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewResearch}
            className="gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            New Research
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              {exportingPdf ? "Generating PDF..." : "Export PDF"}
            </Button>

            <Badge variant="outline" className="text-xs font-mono border-border/30">
              {new Date(report.generatedAt).toLocaleString()}
            </Badge>
          </div>
        </div>

        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400">
            <FileText className="h-3 w-3" />
            Research Complete
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{report.title}</h1>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
            &ldquo;{report.query}&rdquo;
          </p>
        </div>

        {/* Budget Summary */}
        <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto">
          <BudgetStat
            label="Total Budget"
            value={`$${report.budgetSummary.totalUsdc.toFixed(2)}`}
            icon={Coins}
          />
          <BudgetStat
            label="Spent"
            value={`$${report.budgetSummary.spentUsdc.toFixed(4)}`}
            icon={Coins}
            highlight
          />
          <BudgetStat
            label="Remaining"
            value={`$${report.budgetSummary.remainingUsdc.toFixed(4)}`}
            icon={Coins}
          />
        </div>
      </div>

      <Separator className="border-border/20" />

      {/* Report Sections */}
      <Tabs defaultValue={report.sections[0]?.id || "overview"} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto bg-muted/20 border border-border/20 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-wrap md:flex-nowrap">
          {report.sections.map((section) => {
            const Icon = SECTION_ICONS[section.id] || FileText;
            return (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="gap-1.5 text-xs cursor-pointer data-[state=active]:bg-background shrink-0"
              >
                <Icon className="h-3.5 w-3.5" />
                {section.title}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {report.sections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="mt-4">
            <Card className="border-border/20 bg-card/30 backdrop-blur-sm p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                {(() => {
                  const Icon = SECTION_ICONS[section.id] || FileText;
                  return <Icon className="h-5 w-5 text-muted-foreground" />;
                })()}
                {section.title}
              </h2>
              <div className="prose prose-sm prose-invert max-w-none">
                {section.content.split("\n\n").map((paragraph, i) => {
                  if (paragraph.startsWith("•") || paragraph.startsWith("⚠")) {
                    return (
                      <div key={i} className="flex items-start gap-2 my-2">
                        <span className="text-muted-foreground mt-0.5 shrink-0">
                          {paragraph.startsWith("⚠") ? "⚠" : "•"}
                        </span>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          {paragraph.replace(/^[•⚠]\s*/, "")}
                        </p>
                      </div>
                    );
                  }
                  if (paragraph.startsWith("**")) {
                    return (
                      <p
                        key={i}
                        className="text-sm font-semibold text-foreground mt-4 mb-2"
                      >
                        {paragraph.replace(/\*\*/g, "")}
                      </p>
                    );
                  }
                  // Inline citation rendering
                  return (
                    <p key={i} className="text-sm text-foreground/80 leading-relaxed mb-3">
                      {renderWithCitations(paragraph, report.citations)}
                    </p>
                  );
                })}
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Fact-Check Audit */}
      {report.factCheckAudit.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Fact-Check Verification Audit
          </h3>
          <div className="space-y-2">
            {report.factCheckAudit.map((entry, i) => {
              const statusConfig =
                CLAIM_STATUS_CONFIG[entry.status] || CLAIM_STATUS_CONFIG.insufficient_evidence;
              const StatusIcon = statusConfig.icon;

              return (
                <Card
                  key={i}
                  className="border-border/20 bg-card/30 backdrop-blur-sm p-4"
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon
                      className={`h-5 w-5 mt-0.5 shrink-0 ${
                        entry.status === "supported"
                          ? "text-emerald-400"
                          : entry.status === "partially_supported"
                            ? "text-amber-400"
                            : entry.status === "unsupported"
                              ? "text-red-400"
                              : "text-muted-foreground"
                      }`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{entry.claimText}</p>
                        <Badge variant={statusConfig.variant} className="text-[10px]">
                          {statusConfig.label}
                        </Badge>
                      </div>
                      {entry.correctedText && entry.correctedText !== entry.claimText && (
                        <p className="text-xs text-emerald-400/80 italic">
                          Corrected: {entry.correctedText}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {entry.evidenceCount} evidence source{entry.evidenceCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Citations */}
      {report.citations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Sources & Citations
          </h3>
          <Card className="border-border/20 bg-card/30 backdrop-blur-sm p-4">
            <div className="space-y-2">
              {report.citations.map((cit) => (
                <div key={cit.index} className="flex items-start gap-3 text-sm">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground bg-muted/30 rounded px-1.5 py-0.5">
                    [{cit.index}]
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={cit.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {cit.source.title}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] border-border/30">
                        {cit.source.type}
                      </Badge>
                      {cit.paid && (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-emerald-500/30 text-emerald-400"
                        >
                          x402 paid
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Confidence: {(cit.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Payment Proof Panel */}
      <PaymentProofPanel
        payments={report.payments}
        totalSpent={report.budgetSummary.spentUsdc}
      />
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function BudgetStat({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/20 bg-muted/10 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p
        className={`text-sm font-semibold font-mono ${
          highlight ? "text-emerald-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function renderWithCitations(
  text: string,
  citations: CompiledReport["citations"]
): React.ReactNode[] {
  // Match citation markers like [1], [2], etc.
  const parts = text.split(/(\[\d+\])/g);

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const cit = citations.find((c) => c.index === idx);
      if (cit) {
        return (
          <a
            key={i}
            href={cit.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-[10px] font-mono text-blue-400 hover:text-blue-300 bg-blue-500/10 rounded px-1 py-0.5 mx-0.5 cursor-pointer transition-colors"
            title={`${cit.source.title} — ${cit.source.type}${cit.paid ? " (paid)" : ""}`}
          >
            {part}
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}
