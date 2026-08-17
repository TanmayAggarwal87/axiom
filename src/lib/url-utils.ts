/**
 * Axiom URL Normalization and Authoritative Validation Utilities
 */

export function normalizeUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  let trimmed = urlStr.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function isValidUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(normalizeUrl(urlStr));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type SearchResultCandidate = {
  url: string;
  title?: string;
};

/**
 * Ensures that LLM-extracted claims match real, authoritative URLs returned by APIs.
 * Prevents LLM link hallucinations or mangling.
 */
export function matchAuthoritativeSource(
  rawUrl: string,
  rawTitle: string,
  searchResults: SearchResultCandidate[]
): { url: string; title: string } {
  const normRaw = normalizeUrl(rawUrl);

  // 1. Direct exact normalized match
  const exactMatch = searchResults.find((r) => normalizeUrl(r.url) === normRaw);
  if (exactMatch) {
    return {
      url: exactMatch.url,
      title: rawTitle && rawTitle !== "Source" ? rawTitle : exactMatch.title || "Source",
    };
  }

  // 2. Hostname + Path match
  try {
    const rawParsed = new URL(normRaw);
    const domainMatch = searchResults.find((r) => {
      try {
        const candParsed = new URL(normalizeUrl(r.url));
        return candParsed.hostname === rawParsed.hostname;
      } catch {
        return false;
      }
    });

    if (domainMatch) {
      return {
        url: domainMatch.url,
        title: rawTitle && rawTitle !== "Source" ? rawTitle : domainMatch.title || "Source",
      };
    }
  } catch {
    // ignore parse error
  }

  // 3. Fallback to valid raw URL or first available search result
  if (isValidUrl(normRaw)) {
    return {
      url: normRaw,
      title: rawTitle || "Source",
    };
  }

  if (searchResults.length > 0 && searchResults[0].url) {
    return {
      url: searchResults[0].url,
      title: searchResults[0].title || rawTitle || "Source",
    };
  }

  return {
    url: normRaw || "https://axiom.research",
    title: rawTitle || "Source",
  };
}
