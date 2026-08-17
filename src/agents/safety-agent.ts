import type { Task, TaskResult, SourceRef, AgentFinding, AgentOutputData } from "./types";
import { refineQueryWithGemini, extractFindingsWithGemini } from "./gemini";
import { searchTavily } from "./tavily";
import { normalizeUrl, matchAuthoritativeSource } from "@/lib/url-utils";

/**
 * Safety Agent implementation.
 * Type: "safety"
 * Sources: type "safety", paid false
 */
export async function executeSafetyAgent(task: Task): Promise<TaskResult> {
  if (task.type !== "safety") {
    throw new Error(`SafetyAgent invalid task type: expected "safety", got "${task.type}"`);
  }

  if (!task.input || task.input.trim() === "") {
    throw new Error(`SafetyAgent invalid task input: input string cannot be empty`);
  }

  const rawInput = task.input.trim();

  // Step 1: Safety-specific query refinement via Gemini
  const refinedQuery = await refineQueryWithGemini(rawInput, "safety");

  // Step 2: Retrieve safety-focused web sources via Tavily Search
  const searchResults = await searchTavily(refinedQuery, { count: 8 });

  // Step 3: Extract structured safety claims and risk warnings
  const { summary, findings: rawFindings } = await extractFindingsWithGemini(
    refinedQuery,
    searchResults,
    "safety"
  );

  // Step 4: Map and deduplicate sources & findings against authoritative search results
  const sourceMap = new Map<string, SourceRef>();
  const agentFindings: AgentFinding[] = [];

  for (const raw of rawFindings) {
    const authoritative = matchAuthoritativeSource(raw.url, raw.title, searchResults);
    const normKey = normalizeUrl(authoritative.url);

    if (!sourceMap.has(normKey)) {
      sourceMap.set(normKey, {
        title: authoritative.title || "Safety Resource",
        url: authoritative.url,
        type: "safety",
        paid: false,
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
    paymentReceiptId: null,
  };
}

