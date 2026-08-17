import type { Task, TaskResult, SourceRef, AgentFinding, AgentOutputData } from "./types";
import type { PaidFetcher } from "./adapters/paid-fetcher";
import { refineQueryWithGemini, extractFindingsWithGemini } from "./gemini";
import { searchTavily } from "./tavily";
import { normalizeUrl, matchAuthoritativeSource } from "@/lib/url-utils";

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
  forcePaidFetchUrl?: string;
};

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

  // Step 2: Retrieve free academic search results via Tavily Search with academic domain prioritization
  const searchResults = await searchTavily(refinedQuery, {
    count: 8,
    domainFilter: ACADEMIC_DOMAINS,
  });

  // Step 3: Handle Paid Fetcher flow (Dev-only forcePaid override or resource-triggered paywall)
  let paidArticleData: any = null;
  let paidSourceUrl: string | null = null;

  const targetPaidUrl = options?.forcePaidFetchUrl || process.env.X402_RESOURCE_URL || "http://localhost:3000/api/x402-resource";

  if (options?.paidFetcher && targetPaidUrl) {
    try {
      paidSourceUrl = targetPaidUrl;
      const paidRes = await options.paidFetcher.payAndFetch(paidSourceUrl, {
        sessionId: task.sessionId,
        agent: "AcademicAgent",
        purpose: `Accessing paywalled study for task: ${task.id}`,
      });

      paidArticleData = paidRes.data;
      paymentReceiptId = paidRes.receipt?.id || paidRes.paymentReceiptId || null;

      // Inject paid content into search results context for extraction
      if (paidArticleData && typeof paidArticleData === "object") {
        searchResults.unshift({
          title: (paidArticleData as any).title || "Paywalled Academic Journal Article",
          url: paidSourceUrl,
          description: (paidArticleData as any).abstract || (paidArticleData as any).fullText || "",
          snippet: (paidArticleData as any).fullText || (paidArticleData as any).abstract || "",
        });
      }
    } catch (err) {
      console.warn(`[AcademicAgent] Paid fetch warning: ${(err as Error).message}. Falling back to free search path.`);
    }
  }

  // Step 4: Extract structured scientific findings
  const { summary, findings: rawFindings } = await extractFindingsWithGemini(
    refinedQuery,
    searchResults,
    "academic"
  );

  // Step 5: Map and deduplicate sources & findings against authoritative search results
  const sourceMap = new Map<string, SourceRef>();
  const agentFindings: AgentFinding[] = [];

  for (const raw of rawFindings) {
    const authoritative = matchAuthoritativeSource(raw.url, raw.title, searchResults);
    const normKey = normalizeUrl(authoritative.url);
    const isPaid = paidSourceUrl ? normalizeUrl(paidSourceUrl) === normKey : false;

    if (!sourceMap.has(normKey)) {
      sourceMap.set(normKey, {
        title: authoritative.title || "Academic Publication",
        url: authoritative.url,
        type: "academic",
        paid: isPaid,
      });
    }

    const source = sourceMap.get(normKey)!;
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

