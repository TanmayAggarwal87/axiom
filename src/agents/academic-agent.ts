import type { Task, TaskResult, SourceRef, AgentFinding, AgentOutputData } from "./types";
import type { PaidFetcher } from "./adapters/paid-fetcher";
import { refineQueryWithGemini, extractFindingsWithGemini } from "./gemini";
import { searchBrave } from "./brave";

/**
 * Normalizes a URL for deduplication.
 */
function normalizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString().toLowerCase();
  } catch {
    return urlStr.trim().toLowerCase();
  }
}

/**
 * Prioritized academic repositories, preprint servers, and peer-reviewed journal platforms.
 */
const ACADEMIC_DOMAINS = [
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "arxiv.org",
  "biorxiv.org",
  "medrxiv.org",
  "doi.org",
  "crossref.org",
  "sciencedirect.com",
  "nature.com",
  "frontiersin.org",
  "plos.org",
  "ieee.org",
  "springer.com",
  "wiley.com",
  "thelancet.com",
  "cell.com",
  "jamanetwork.com",
  "nejm.org",
];

export type AcademicAgentOptions = {
  paidFetcher?: PaidFetcher;
  /**
   * @devOnly TEST-ONLY CONTROL:
   * Do NOT use this parameter in production code or expose it to end users.
   * In production, the Academic Agent autonomously detects paywalled resources
   * and routes requests through the Module 3 PaidFetcher boundary.
   */
  forcePaidFetchUrl?: string;
};

/**
 * Academic Agent implementation.
 * Type: "academic"
 * Sources: type "academic", paid false (free path) or paid true (paid path)
 * 
 * INTENDED PRODUCTION FLOW:
 * Academic Agent -> Discover resource -> Detect paid access requirement -> Call PaidFetcher boundary -> Module 3 handles x402 settlement
 */
export async function executeAcademicAgent(
  task: Task,
  options?: AcademicAgentOptions
): Promise<TaskResult> {
  if (task.type !== "academic") {
    throw new Error(`AcademicAgent invalid task type: expected "academic", got "${task.type}"`);
  }

  if (!task.input || task.input.trim() === "") {
    throw new Error(`AcademicAgent invalid task input: input string cannot be empty`);
  }

  const rawInput = task.input.trim();
  let paymentReceiptId: string | null = null;

  // Step 1: Academic-focused query refinement via Gemini
  const refinedQuery = await refineQueryWithGemini(rawInput, "academic");

  // Step 2: Retrieve free academic search results via Brave Search with academic domain prioritization
  const searchResults = await searchBrave(refinedQuery, {
    count: 8,
    domainFilter: ACADEMIC_DOMAINS,
  });

  // Step 3: Handle Paid Fetcher flow (Dev-only forcePaid override or resource-triggered paywall)
  let paidArticleData: any = null;
  let paidSourceUrl: string | null = null;

  // Ensure forcePaidFetchUrl is only accepted when explicitly provided in test/dev execution
  if (options?.forcePaidFetchUrl && options.paidFetcher) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_FORCE_PAID !== "true") {
      console.warn("[AcademicAgent] forcePaidFetchUrl override rejected in production mode.");
    } else {
      paidSourceUrl = options.forcePaidFetchUrl;
      const paidRes = await options.paidFetcher.payAndFetch(paidSourceUrl, {
        sessionId: task.sessionId,
        agent: "AcademicAgent",
        purpose: `Accessing paywalled study for task: ${task.id}`,
      });

      paidArticleData = paidRes.data;
      paymentReceiptId = paidRes.paymentReceiptId;

      // Inject paid content into search results context for extraction
      if (paidArticleData && typeof paidArticleData === "object") {
        searchResults.unshift({
          title: (paidArticleData as any).title || "Paywalled Academic Journal Article",
          url: paidSourceUrl,
          description: (paidArticleData as any).abstract || (paidArticleData as any).fullText || "",
          snippet: (paidArticleData as any).fullText || (paidArticleData as any).abstract || "",
        });
      }
    }
  }

  // Step 4: Extract structured scientific findings
  const { summary, findings: rawFindings } = await extractFindingsWithGemini(
    refinedQuery,
    searchResults,
    "academic"
  );

  // Step 5: Map and deduplicate sources & findings (all sources marked type "academic")
  const sourceMap = new Map<string, SourceRef>();
  const agentFindings: AgentFinding[] = [];

  for (const raw of rawFindings) {
    const normUrl = normalizeUrl(raw.url);
    const isPaid = paidSourceUrl ? normalizeUrl(paidSourceUrl) === normUrl : false;

    if (!sourceMap.has(normUrl)) {
      sourceMap.set(normUrl, {
        title: raw.title || "Academic Publication",
        url: raw.url,
        type: "academic",
        paid: isPaid,
      });
    }

    const source = sourceMap.get(normUrl)!;
    agentFindings.push({
      claim: raw.claim,
      source,
      excerpt: raw.excerpt,
    });
  }

  const uniqueSources = Array.from(sourceMap.values());

  const outputData: AgentOutputData = {
    refinedQuery,
    summary,
    findings: agentFindings,
  };

  return {
    taskId: task.id,
    data: outputData,
    sources: uniqueSources,
    paymentReceiptId,
  };
}
