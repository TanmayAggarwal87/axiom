// Gemini API helper for query refinement & structured extraction

import {
  QUERY_REFINEMENT_PROMPT,
  EXTRACT_FINDINGS_SEARCH_PROMPT,
  EXTRACT_FINDINGS_SAFETY_PROMPT,
  EXTRACT_FINDINGS_ACADEMIC_PROMPT,
} from "./prompts";

const GEMINI_MODEL = "gemini-3.6-flash";

function isMockAllowed(): boolean {
  return process.env.ALLOW_MOCKS === "true" || process.env.NODE_ENV === "test";
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY_2;
  if (!key) {
    if (isMockAllowed()) {
      return "";
    }
    throw new Error(
      "Missing required environment variable GEMINI_API_KEY. Configure GEMINI_API_KEY in .env or set ALLOW_MOCKS=true for explicit local testing."
    );
  }
  return key;
}

/**
 * Low-level call to Gemini REST API with JSON output mode.
 */
async function callGeminiJson(prompt: string): Promise<any> {
  const apiKey = getApiKey();

  if (!apiKey && isMockAllowed()) {
    console.warn(
      "[Gemini] Missing GEMINI_API_KEY in explicit test/mock mode. Returning mock JSON payload."
    );
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Gemini API request failed with status ${response.status}: ${errText}`
    );
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!rawText) {
    throw new Error("Gemini returned empty response text.");
  }

  try {
    return JSON.parse(rawText);
  } catch (err) {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Refine user research query according to agent type using Gemini.
 */
export async function refineQueryWithGemini(
  input: string,
  agentType: "search" | "academic" | "safety"
): Promise<string> {
  const prompt = QUERY_REFINEMENT_PROMPT.replace("{{agentType}}", agentType).replace(
    "{{input}}",
    input
  );

  try {
    const res = await callGeminiJson(prompt);
    if (res && res.refinedQuery && typeof res.refinedQuery === "string") {
      return res.refinedQuery.trim();
    }
  } catch (error) {
    if (!isMockAllowed()) {
      throw error;
    }
    console.warn("[Gemini] Query refinement error in mock mode, returning original input:", error);
  }

  return input;
}

export type ExtractedRawFinding = {
  claim: string;
  url: string;
  title: string;
  excerpt?: string;
};

export type ExtractedFindingsResult = {
  summary: string;
  findings: ExtractedRawFinding[];
};

/**
 * Extract structured findings from search results using Gemini.
 */
export async function extractFindingsWithGemini(
  query: string,
  searchResults: Array<{ title: string; url: string; description: string; snippet?: string }>,
  agentType: "search" | "academic" | "safety"
): Promise<ExtractedFindingsResult> {
  let promptTemplate = EXTRACT_FINDINGS_SEARCH_PROMPT;
  if (agentType === "safety") {
    promptTemplate = EXTRACT_FINDINGS_SAFETY_PROMPT;
  } else if (agentType === "academic") {
    promptTemplate = EXTRACT_FINDINGS_ACADEMIC_PROMPT;
  }

  const prompt = promptTemplate
    .replace("{{query}}", query)
    .replace("{{searchResultsJson}}", JSON.stringify(searchResults, null, 2));

  try {
    const res = await callGeminiJson(prompt);
    if (res && Array.isArray(res.findings)) {
      return {
        summary: typeof res.summary === "string" ? res.summary : "",
        findings: res.findings.map((f: any) => ({
          claim: String(f.claim || ""),
          url: String(f.url || ""),
          title: String(f.title || "Source"),
          excerpt: f.excerpt ? String(f.excerpt) : undefined,
        })),
      };
    }
  } catch (error) {
    if (!isMockAllowed()) {
      throw error;
    }
    console.warn("[Gemini] Extraction error in mock mode, returning formatted mock findings:", error);
  }

  // Fallback structuring when explicitly in mock/test mode
  return {
    summary: `Structured ${agentType} research summary for: "${query}".`,
    findings: searchResults.map((item) => ({
      claim: item.description || item.snippet || item.title,
      url: item.url,
      title: item.title,
      excerpt: item.snippet || item.description,
    })),
  };
}
