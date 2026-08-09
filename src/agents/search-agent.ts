import type { Task, TaskResult, SourceRef, AgentFinding, AgentOutputData } from "./types";
import { refineQueryWithGemini, extractFindingsWithGemini } from "./gemini";
import { searchTavily } from "./tavily";

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
 * Search Agent implementation.
 * Type: "search"
 * Sources: type "web", paid false
 */
export async function executeSearchAgent(task: Task): Promise<TaskResult> {
  if (task.type !== "search") {
    throw new Error(`SearchAgent invalid task type: expected "search", got "${task.type}"`);
  }

  if (!task.input || task.input.trim() === "") {
    throw new Error(`SearchAgent invalid task input: input string cannot be empty`);
  }

  const rawInput = task.input.trim();

  // Step 1: Query Refinement via Gemini
  const refinedQuery = await refineQueryWithGemini(rawInput, "search");

  // Step 2: Retrieve Search Results via Tavily API
  const searchResults = await searchTavily(refinedQuery, { count: 8 });

  // Step 3: Extract structured findings via Gemini
  const { summary, findings: rawFindings } = await extractFindingsWithGemini(
    refinedQuery,
    searchResults,
    "search"
  );

  // Step 4: Map and deduplicate sources & findings
  const sourceMap = new Map<string, SourceRef>();
  const agentFindings: AgentFinding[] = [];

  for (const raw of rawFindings) {
    const normUrl = normalizeUrl(raw.url);

    if (!sourceMap.has(normUrl)) {
      sourceMap.set(normUrl, {
        title: raw.title || "Web Source",
        url: raw.url,
        type: "web",
        paid: false,
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
    paymentReceiptId: null,
  };
}
