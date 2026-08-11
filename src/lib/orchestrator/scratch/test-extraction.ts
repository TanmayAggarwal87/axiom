import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const apiKey = process.env.GEMINI_API_KEY || "";

async function testResponseSchema() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  // Use a query and mock search results for Neem to test the actual prompt
  const query = "Research Neem plant (Azadirachta indica) traditional medicinal uses, active compounds, and general botanical profile.";
  
  const searchResults = [
    {
      title: "Neem (Azadirachta indica): Prehistory to contemporary medicinal uses",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3768784/",
      description: "Neem (Azadirachta indica) is a member of the Meliaceae family and its role as health promoting effect is attributed because it is a rich source of antioxidants and active chemical constituents. It has been used traditionally for centuries to treat various diseases like malaria, skin infections, fever, etc."
    },
    {
      title: "Azadirachta indica - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Azadirachta_indica",
      description: "Azadirachta indica, commonly known as neem, nimtree or Indian lilac, is a tree in the mahogany family Meliaceae. It is native to the Indian subcontinent. Fruits and seeds are the source of neem oil. Neem leaves are dried and placed in cupboards to prevent insects eating clothes."
    }
  ];

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

  console.log("Testing with structured output and logging finishReason...");
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
  console.log("Candidate details:");
  const candidate = resJson?.candidates?.[0];
  console.log("- finishReason:", candidate?.finishReason);
  console.log("- text length:", candidate?.content?.parts?.[0]?.text?.length);
  console.log("- raw text snippet:", candidate?.content?.parts?.[0]?.text?.substring(0, 300));
}

testResponseSchema();
