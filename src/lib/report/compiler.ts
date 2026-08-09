import type { SessionState } from "@/lib/orchestrator/types";
import type { Evidence, Claim, PaymentReceipt, SourceRef } from "@/types/shared";

// ─── Compiled Report Shape ─────────────────────────────────────────────────────

export type ReportSection = {
  id: string;
  title: string;
  content: string; // markdown-ish prose with inline citation markers [1], [2]
};

export type CitationEntry = {
  index: number; // 1-based
  source: SourceRef;
  confidence: number; // average confidence from evidence referencing this source
  paid: boolean;
};

export type FactCheckEntry = {
  claimText: string;
  status: Claim["status"];
  correctedText: string | null;
  evidenceCount: number;
};

export type CompiledReport = {
  title: string;
  query: string;
  sections: ReportSection[];
  citations: CitationEntry[];
  factCheckAudit: FactCheckEntry[];
  payments: PaymentReceipt[];
  budgetSummary: {
    totalUsdc: number;
    spentUsdc: number;
    remainingUsdc: number;
  };
  generatedAt: string;
};

// ─── Compiler ──────────────────────────────────────────────────────────────────

/**
 * Compiles a structured report from the full session state.
 * This is a pure function — no DB calls, no side effects.
 */
export function compileReport(state: SessionState, originalQuery: string): CompiledReport {
  // 1. Build citation index from unique source URLs across all evidence
  const citations = buildCitations(state.evidence);

  // 2. Extract narrative from synthesizer task result
  const synthTask = state.tasks.find((t) => t.type === "synthesize");
  const synthNarrative =
    (synthTask?.result?.data as { summary?: string })?.summary ||
    "Research synthesis is pending or unavailable.";

  // 3. Collect all source references from completed tasks
  const allSources = state.tasks
    .filter((t) => t.status === "done" && t.result)
    .flatMap((t) => t.result!.sources || []);

  // 4. Build report sections
  const sections = buildSections(state, synthNarrative, citations, allSources);

  // 5. Build fact-check audit
  const factCheckAudit = buildFactCheckAudit(state.claims, state.evidence);

  // 6. Budget summary
  const budgetSummary = {
    totalUsdc: state.budget?.totalUsdc ?? 0,
    spentUsdc: state.budget?.spentUsdc ?? 0,
    remainingUsdc: (state.budget?.totalUsdc ?? 0) - (state.budget?.spentUsdc ?? 0),
  };

  return {
    title: `Axiom Research Report`,
    query: originalQuery,
    sections,
    citations,
    factCheckAudit,
    payments: state.payments,
    budgetSummary,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildCitations(evidence: Evidence[]): CitationEntry[] {
  // Group evidence by source URL to deduplicate
  const urlMap = new Map<string, { source: SourceRef; confidences: number[] }>();

  for (const ev of evidence) {
    const key = ev.source.url;
    if (!urlMap.has(key)) {
      urlMap.set(key, { source: ev.source, confidences: [] });
    }
    urlMap.get(key)!.confidences.push(ev.confidence);
  }

  const entries: CitationEntry[] = [];
  let idx = 1;
  for (const [, { source, confidences }] of urlMap) {
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;
    entries.push({
      index: idx++,
      source,
      confidence: Math.round(avgConfidence * 100) / 100,
      paid: source.paid,
    });
  }

  return entries;
}

function buildSections(
  state: SessionState,
  synthNarrative: string,
  citations: CitationEntry[],
  allSources: SourceRef[]
): ReportSection[] {
  // Gather task results by type for section content
  const searchResults = state.tasks
    .filter((t) => t.type === "search" && t.status === "done" && t.result)
    .map((t) => t.result!.data);

  const academicResults = state.tasks
    .filter((t) => t.type === "academic" && t.status === "done" && t.result)
    .map((t) => t.result!.data);

  const safetyResults = state.tasks
    .filter((t) => t.type === "safety" && t.status === "done" && t.result)
    .map((t) => t.result!.data);

  const paidSources = allSources.filter((s) => s.paid);

  const sections: ReportSection[] = [
    {
      id: "overview",
      title: "Executive Summary",
      content: synthNarrative,
    },
    {
      id: "findings",
      title: "Key Findings",
      content: buildFindingsContent(searchResults, citations),
    },
    {
      id: "academic",
      title: "Scientific & Academic Evidence",
      content: buildAcademicContent(academicResults, paidSources, citations),
    },
    {
      id: "safety",
      title: "Safety, Risks & Contraindications",
      content: buildSafetyContent(safetyResults, citations),
    },
    {
      id: "limitations",
      title: "Limitations & Knowledge Gaps",
      content: buildLimitationsContent(state),
    },
  ];

  return sections;
}

function buildFindingsContent(
  searchResults: unknown[],
  citations: CitationEntry[]
): string {
  if (searchResults.length === 0) {
    return "No web search results were retrieved for this research session.";
  }

  const lines: string[] = [];
  for (const result of searchResults) {
    const data = result as { findings?: string[]; summary?: string };
    if (data?.summary) {
      lines.push(data.summary);
    }
    if (data?.findings && Array.isArray(data.findings)) {
      for (const finding of data.findings) {
        lines.push(`• ${finding}`);
      }
    }
  }

  if (lines.length === 0) {
    return "Search agents completed but returned no structured findings.";
  }

  // Append citation markers for first few citations
  const citationRefs = citations
    .slice(0, 3)
    .map((c) => `[${c.index}]`)
    .join(" ");

  return lines.join("\n\n") + (citationRefs ? `\n\n${citationRefs}` : "");
}

function buildAcademicContent(
  academicResults: unknown[],
  paidSources: SourceRef[],
  citations: CitationEntry[]
): string {
  if (academicResults.length === 0 && paidSources.length === 0) {
    return "No academic sources were retrieved during this research session.";
  }

  const lines: string[] = [];
  for (const result of academicResults) {
    const data = result as { findings?: string[]; summary?: string };
    if (data?.summary) {
      lines.push(data.summary);
    }
    if (data?.findings && Array.isArray(data.findings)) {
      for (const finding of data.findings) {
        lines.push(`• ${finding}`);
      }
    }
  }

  if (paidSources.length > 0) {
    lines.push(
      `\n**Paid Sources Retrieved (${paidSources.length}):** These sources were accessed via x402 micropayments on Base Sepolia testnet.`
    );
    for (const src of paidSources) {
      const citIndex = citations.find(
        (c) => c.source.url === src.url
      )?.index;
      lines.push(
        `• ${src.title} ${citIndex ? `[${citIndex}]` : ""} — ${src.url}`
      );
    }
  }

  if (lines.length === 0) {
    return "Academic agents completed but returned no structured findings.";
  }

  return lines.join("\n\n");
}

function buildSafetyContent(
  safetyResults: unknown[],
  citations: CitationEntry[]
): string {
  if (safetyResults.length === 0) {
    return "No safety or risk data was retrieved during this research session.";
  }

  const lines: string[] = [];
  for (const result of safetyResults) {
    const data = result as { findings?: string[]; summary?: string; risks?: string[] };
    if (data?.summary) {
      lines.push(data.summary);
    }
    if (data?.risks && Array.isArray(data.risks)) {
      lines.push("**Identified Risks:**");
      for (const risk of data.risks) {
        lines.push(`⚠ ${risk}`);
      }
    }
    if (data?.findings && Array.isArray(data.findings)) {
      for (const finding of data.findings) {
        lines.push(`• ${finding}`);
      }
    }
  }

  if (lines.length === 0) {
    return "Safety agents completed but returned no structured findings.";
  }

  return lines.join("\n\n");
}

function buildLimitationsContent(state: SessionState): string {
  const lines: string[] = [];

  const failedTasks = state.tasks.filter((t) => t.status === "failed");
  const unsupportedClaims = state.claims.filter(
    (c) => c.status === "unsupported" || c.status === "insufficient_evidence"
  );

  if (failedTasks.length > 0) {
    lines.push(
      `**${failedTasks.length} task(s) failed** during execution, which may have limited the completeness of this report.`
    );
  }

  if (unsupportedClaims.length > 0) {
    lines.push(
      `**${unsupportedClaims.length} claim(s)** could not be sufficiently verified and are marked as unsupported or having insufficient evidence.`
    );
  }

  const dynamicTasks = state.tasks.filter((t) => t.createdBy === "factchecker");
  if (dynamicTasks.length > 0) {
    lines.push(
      `The fact-checker spawned **${dynamicTasks.length} additional task(s)** to verify claims that initially lacked supporting evidence.`
    );
  }

  if (state.budget) {
    const cappedEvents = state.events.filter((e) => e.type === "budget_capped");
    if (cappedEvents.length > 0) {
      lines.push(
        "Budget or iteration caps were reached during the fact-checking phase, which may have limited verification depth."
      );
    }
  }

  if (lines.length === 0) {
    lines.push(
      "No significant limitations were detected during this research session. All agents completed successfully."
    );
  }

  return lines.join("\n\n");
}

function buildFactCheckAudit(claims: Claim[], evidence: Evidence[]): FactCheckEntry[] {
  return claims.map((claim) => ({
    claimText: claim.text,
    status: claim.status,
    correctedText: claim.supportedText,
    evidenceCount: claim.evidenceIds.length,
  }));
}
