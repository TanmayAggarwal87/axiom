import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const apiKey = process.env.GEMINI_API_KEY || "";

async function testExtractionRawPrompt() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  // Use a query and mock search results for Neem to test the actual prompt
  const query = "Research Neem plant (Azadirachta indica) traditional medicinal uses, active compounds, and general botanical profile.";
  
  // Real search results from Tavily can be large (8 items). Let's simulate a large search result set.
  const searchResults = Array.from({ length: 8 }).map((_, i) => ({
    title: `Neem Study Publication Volume #${i} - Efficacy of Azadirachta indica Extract in Animal Models and In Vitro Assays`,
    url: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3768784_vol${i}/`,
    description: `Detailed description for publication volume #${i}. Neem (Azadirachta indica) is a member of the Meliaceae family and its role as health promoting effect is attributed because it is a rich source of antioxidants and active chemical constituents. It has been used traditionally for centuries to treat various diseases like malaria, skin infections, fever, etc. This research analyzes pharmacological compounds such as nimbin, nimbinin, and azadirachtin which show high anti-inflammatory, anti-pyretic, antimicrobial, and antihistamine activities. We tested these extracts on human cell lines and recorded significant inhibitory concentrations (IC50) which are promising for therapeutic development.`
  }));

  const promptTemplate = `
You are a web research agent analyzing web search results.
Query: {{query}}

Search Results:
{{searchResultsJson}}

Your task:
1. Extract factual claims and findings relevant to the query.
2. Every claim must be tied directly to a specific source URL from the provided search results.
3. Do NOT hallucinate sources, URLs, or facts not present in the results.
4. Summarize the overall findings into a concise overview paragraph.

Output ONLY a JSON object in this exact format:
{
  "summary": "Brief overall synthesis of the findings",
  "findings": [
    {
      "claim": "Specific factual claim extracted from the content",
      "url": "Exact source URL from search results",
      "title": "Title of the source document/page",
      "excerpt": "Direct supporting quote or key passage"
    }
  ]
}
`;

  const prompt = promptTemplate
    .replace("{{query}}", query)
    .replace("{{searchResultsJson}}", JSON.stringify(searchResults, null, 2));

  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            claim: { type: "string" },
            url: { type: "string" },
            title: { type: "string" },
            excerpt: { type: "string" }
          },
          required: ["claim", "url", "title"]
        }
      }
    },
    required: ["summary", "findings"]
  };

  console.log("Testing with structured output, 8 large mock results, and logging finishReason...");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: 2500,
        temperature: 0.2
      }
    })
  });

  const resJson = await response.json();
  const candidate = resJson?.candidates?.[0];
  console.log("Candidate details:");
  console.log("- finishReason:", candidate?.finishReason);
  console.log("- text length:", candidate?.content?.parts?.[0]?.text?.length);
  console.log("- raw text snippet:", candidate?.content?.parts?.[0]?.text?.substring(0, 300));
  if (candidate?.finishReason !== "STOP") {
    console.log("Truncated raw text end snippet:");
    const text = candidate?.content?.parts?.[0]?.text || "";
    console.log(text.substring(text.length - 300));
  }
}

testExtractionRawPrompt();
