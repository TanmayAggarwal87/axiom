// Brave Search API helper for web and academic source retrieval

export type BraveSearchResultItem = {
  title: string;
  url: string;
  description: string;
  snippet?: string;
};

function isMockAllowed(): boolean {
  return process.env.ALLOW_MOCKS === "true" || process.env.NODE_ENV === "test";
}

function getBraveApiKey(): string {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    if (isMockAllowed()) {
      return "";
    }
    throw new Error(
      "Missing required environment variable BRAVE_SEARCH_API_KEY. Configure BRAVE_SEARCH_API_KEY in .env or set ALLOW_MOCKS=true for explicit local testing."
    );
  }
  return key;
}

/**
 * Fetch search results using Brave Search API.
 */
export async function searchBrave(
  query: string,
  options?: { count?: number; domainFilter?: string[] }
): Promise<BraveSearchResultItem[]> {
  const apiKey = getBraveApiKey();
  const count = options?.count || 8;

  let searchQuery = query;
  if (options?.domainFilter && options.domainFilter.length > 0) {
    const siteConstraints = options.domainFilter.map((d) => `site:${d}`).join(" OR ");
    searchQuery = `(${searchQuery}) (${siteConstraints})`;
  }

  if (!apiKey && isMockAllowed()) {
    console.warn(
      "[BraveSearch] Missing BRAVE_SEARCH_API_KEY in explicit test/mock mode. Returning mock search results."
    );
    return generateMockSearchResults(query, options?.domainFilter);
  }

  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    searchQuery
  )}&count=${count}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      if (isMockAllowed()) {
        console.warn(
          `[BraveSearch] Request failed (${response.status}): ${errText}. Falling back to mock results in mock mode.`
        );
        return generateMockSearchResults(query, options?.domainFilter);
      }
      throw new Error(`Brave Search API request failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const results: BraveSearchResultItem[] = [];

    if (data?.web?.results && Array.isArray(data.web.results)) {
      for (const item of data.web.results) {
        results.push({
          title: item.title || "Untitled Source",
          url: item.url,
          description: item.description || "",
          snippet: item.snippet || item.description || "",
        });
      }
    }

    if (results.length === 0 && isMockAllowed()) {
      return generateMockSearchResults(query, options?.domainFilter);
    }

    return results;
  } catch (error) {
    if (isMockAllowed()) {
      console.error("[BraveSearch] Error during search, using mock fallback in test mode:", error);
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
): BraveSearchResultItem[] {
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
        description: `Comprehensive peer-reviewed investigation into active compounds and clinical efficacy related to ${query}.`,
        snippet:
          "Chromatographic profiling revealed high concentrations of flavonoids and triterpenoid saponins exhibiting marked bioactivity in controlled assays.",
      },
      {
        title: `Systematic Review on Clinical Evidence: ${query}`,
        url: "https://arxiv.org/abs/2304.09182",
        description: `Meta-analysis evaluating quantitative outcomes, dosage responses, and pharmacological mechanisms.`,
        snippet:
          "Across 14 double-blind randomized trials, subject cohorts demonstrated statistically significant improvements compared to baseline control parameters.",
      },
      {
        title: `Pharmacological Mechanism & Bioavailability Study`,
        url: "https://www.sciencedirect.com/science/article/pii/S037887412200192X",
        description: "In vitro cellular studies assessing receptor affinity and cellular uptake pathways.",
        snippet: "Results confirm target engagement with minimal cytotoxicity at therapeutic concentrations.",
      },
    ];
  }

  if (isSafety) {
    return [
      {
        title: `Safety Profile and Toxicology Data: ${query}`,
        url: "https://www.who.int/news-room/fact-sheets/detail/safety-evaluation-data",
        description: `Official safety review documenting contraindications, maximum daily dosage recommendations, and observed adverse effects.`,
        snippet:
          "High-dose chronic exposure may induce mild hepatic enzyme elevation. Contraindicated in individuals with active pre-existing liver conditions or during pregnancy.",
      },
      {
        title: `Drug Interactions and Side Effect Warnings: ${query}`,
        url: "https://www.fda.gov/safety/medwatch-safety-information-and-adverse-event-reporting",
        description: "Clinical monograph detailing cytochrome P450 inhibition and potential herb-drug interactions.",
        snippet:
          "Concomitant administration with anticoagulants or immunosuppressants requires therapeutic monitoring due to synergistic plasma clearance changes.",
      },
      {
        title: `Risk Assessment and Vulnerable Populations Analysis`,
        url: "https://www.ema.europa.eu/en/medicines/human/herbal-safety-public-assessment-reports",
        description: "European Medicines Agency monograph on pediatric and pregnancy precautions.",
        snippet:
          "Insufficient clinical trial safety data exists for pediatric populations (<12 years). Use is restricted to adult populations under supervision.",
      },
    ];
  }

  return [
    {
      title: `Overview and Research Guide: ${query}`,
      url: "https://en.wikipedia.org/wiki/Research_overview",
      description: `Detailed background, historical applications, and traditional context for ${query}.`,
      snippet:
        "Widely studied across multiple scientific disciplines for its multi-faceted biological properties and practical applications.",
    },
    {
      title: `Comprehensive Guide and Current Applications`,
      url: "https://www.sciencedaily.com/releases/2024/01/240115120000.htm",
      description: "Summary of modern applications, therapeutic potential, and ongoing empirical research.",
      snippet:
        "Recent interest has expanded into novel formulations and standardized extract preparation.",
    },
    {
      title: `Botanical and Pharmacological Monograph`,
      url: "https://www.kew.org/science/plants-and-fungi/research-monograph",
      description: "Botanical taxonomy, native habitat, traditional usage, and chemical constituents.",
      snippet:
        "Contains active limonoids, azadirachtin derivatives, and antioxidants supporting traditional health claims.",
    },
  ];
}
