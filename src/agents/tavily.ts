// Tavily Search API helper for web, safety, and academic source retrieval

export type TavilySearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  description: string;
};

function isMockAllowed(): boolean {
  return process.env.ALLOW_MOCKS === "true" || process.env.NODE_ENV === "test";
}

function getTavilyApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    if (isMockAllowed()) {
      return "";
    }
    throw new Error(
      "Missing required environment variable TAVILY_API_KEY. Configure TAVILY_API_KEY in .env or set ALLOW_MOCKS=true for explicit local testing."
    );
  }
  return key;
}

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
 * Fetch search results using Tavily Search API.
 */
export async function searchTavily(
  query: string,
  options?: { count?: number; domainFilter?: string[] }
): Promise<TavilySearchResultItem[]> {
  const apiKey = getTavilyApiKey();
  const count = options?.count || 8;

  if (!apiKey && isMockAllowed()) {
    console.warn(
      "[TavilySearch] Missing TAVILY_API_KEY in explicit test/mock mode. Returning mock search results."
    );
    return generateMockSearchResults(query, options?.domainFilter);
  }

  const endpoint = "https://api.tavily.com/search";

  const payload: Record<string, any> = {
    api_key: apiKey,
    query: query,
    max_results: count,
    search_depth: "basic",
  };

  if (options?.domainFilter && options.domainFilter.length > 0) {
    payload.include_domains = options.domainFilter;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (isMockAllowed()) {
        console.warn(
          `[TavilySearch] Request failed (${response.status}): ${errText}. Falling back to mock results in mock mode.`
        );
        return generateMockSearchResults(query, options?.domainFilter);
      }
      throw new Error(`Tavily Search API request failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const results: TavilySearchResultItem[] = [];
    const seenUrls = new Set<string>();

    if (data?.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        if (!item.url) continue;
        const normUrl = normalizeUrl(item.url);
        if (seenUrls.has(normUrl)) continue;
        seenUrls.add(normUrl);

        const title = (item.title || "Untitled Source").trim();
        const snippet = (item.content || item.snippet || "").trim();
        const content = item.content || snippet;

        results.push({
          title,
          url: item.url,
          snippet,
          content,
          description: snippet || title,
        });
      }
    }

    if (results.length === 0 && isMockAllowed()) {
      return generateMockSearchResults(query, options?.domainFilter);
    }

    return results;
  } catch (error) {
    if (isMockAllowed()) {
      console.error("[TavilySearch] Error during search, using mock fallback in test mode:", error);
      return generateMockSearchResults(query, options?.domainFilter);
    }
    throw error;
  }
}

/**
 * Realistic mock search results for explicit test/dev mode when API key is missing.
 */
function generateMockSearchResults(
  query: string,
  domainFilter?: string[]
): TavilySearchResultItem[] {
  const isAcademic =
    domainFilter &&
    domainFilter.some((d) => d.includes("ncbi") || d.includes("arxiv") || d.includes("doi"));
  const isSafety =
    query.toLowerCase().includes("risk") ||
    query.toLowerCase().includes("side effect") ||
    query.toLowerCase().includes("toxicity");

  if (isAcademic) {
    return [
      {
        title: `Phytochemical Analysis and Bioactive Properties: ${query}`,
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8921012/",
        snippet:
          "Chromatographic profiling revealed high concentrations of flavonoids and triterpenoid saponins exhibiting marked bioactivity in controlled assays.",
        content:
          "Comprehensive peer-reviewed investigation into active compounds and clinical efficacy related to " +
          query,
        description:
          "Comprehensive peer-reviewed investigation into active compounds and clinical efficacy related to " +
          query,
      },
      {
        title: `Systematic Review on Clinical Evidence: ${query}`,
        url: "https://arxiv.org/abs/2304.09182",
        snippet:
          "Across 14 double-blind randomized trials, subject cohorts demonstrated statistically significant improvements compared to baseline control parameters.",
        content:
          "Meta-analysis evaluating quantitative outcomes, dosage responses, and pharmacological mechanisms.",
        description:
          "Meta-analysis evaluating quantitative outcomes, dosage responses, and pharmacological mechanisms.",
      },
      {
        title: `Pharmacological Mechanism & Bioavailability Study`,
        url: "https://www.sciencedirect.com/science/article/pii/S037887412200192X",
        snippet: "Results confirm target engagement with minimal cytotoxicity at therapeutic concentrations.",
        content: "In vitro cellular studies assessing receptor affinity and cellular uptake pathways.",
        description: "In vitro cellular studies assessing receptor affinity and cellular uptake pathways.",
      },
    ];
  }

  if (isSafety) {
    return [
      {
        title: `Safety Profile and Toxicology Data: ${query}`,
        url: "https://www.who.int/news-room/fact-sheets/detail/safety-evaluation-data",
        snippet:
          "High-dose chronic exposure may induce mild hepatic enzyme elevation. Contraindicated in individuals with active pre-existing liver conditions or during pregnancy.",
        content:
          "Official safety review documenting contraindications, maximum daily dosage recommendations, and observed adverse effects.",
        description:
          "Official safety review documenting contraindications, maximum daily dosage recommendations, and observed adverse effects.",
      },
      {
        title: `Drug Interactions and Side Effect Warnings: ${query}`,
        url: "https://www.fda.gov/safety/medwatch-safety-information-and-adverse-event-reporting",
        snippet:
          "Concomitant administration with anticoagulants or immunosuppressants requires therapeutic monitoring due to synergistic plasma clearance changes.",
        content: "Clinical monograph detailing cytochrome P450 inhibition and potential herb-drug interactions.",
        description: "Clinical monograph detailing cytochrome P450 inhibition and potential herb-drug interactions.",
      },
      {
        title: `Risk Assessment and Vulnerable Populations Analysis`,
        url: "https://www.ema.europa.eu/en/medicines/human/herbal-safety-public-assessment-reports",
        snippet:
          "Insufficient clinical trial safety data exists for pediatric populations (<12 years). Use is restricted to adult populations under supervision.",
        content: "European Medicines Agency monograph on pediatric and pregnancy precautions.",
        description: "European Medicines Agency monograph on pediatric and pregnancy precautions.",
      },
    ];
  }

  return [
    {
      title: `Overview and Research Guide: ${query}`,
      url: "https://en.wikipedia.org/wiki/Research_overview",
      snippet:
        "Widely studied across multiple scientific disciplines for its multi-faceted biological properties and practical applications.",
      content: `Detailed background, historical applications, and traditional context for ${query}.`,
      description: `Detailed background, historical applications, and traditional context for ${query}.`,
    },
    {
      title: `Comprehensive Guide and Current Applications`,
      url: "https://www.sciencedaily.com/releases/2024/01/240115120000.htm",
      snippet:
        "Recent interest has expanded into novel formulations and standardized extract preparation.",
      content: "Summary of modern applications, therapeutic potential, and ongoing empirical research.",
      description: "Summary of modern applications, therapeutic potential, and ongoing empirical research.",
    },
    {
      title: `Botanical and Pharmacological Monograph`,
      url: "https://www.kew.org/science/plants-and-fungi/research-monograph",
      snippet:
        "Contains active limonoids, azadirachtin derivatives, and antioxidants supporting traditional health claims.",
      content: "Botanical taxonomy, native habitat, traditional usage, and chemical constituents.",
      description: "Botanical taxonomy, native habitat, traditional usage, and chemical constituents.",
    },
  ];
}
