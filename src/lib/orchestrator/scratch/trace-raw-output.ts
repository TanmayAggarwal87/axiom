import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const apiKey = process.env.GEMINI_API_KEY || "";

async function traceRawOutputsForRealQuery() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  // Mock search results simulating what Tavily returns in real execution
  const searchResults = [
    {
      title: "Neem tree - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Neem",
      description: "Neem is a natural herb that comes from the neem tree, other names of which include Azadirachta indica and Indian lilac. The extract comes from the seeds of the tree and has many different traditional uses. Neem is known for its pesticidal and insecticidal properties, but people also use it in hair and dental products."
    },
    {
      title: "Neem: Uses, Side Effects, Interactions, Dosage, and Warning",
      url: "https://www.webmd.com/vitamins/ai/ingredientmono-577/neem",
      description: "Neem is a tree. The bark, leaves, and seeds are used to make medicine. Less often, the root, flower, and fruit are also used. Neem leaf is used for leprosy, eye disorders, bloody nose, intestinal worms, upset stomach, loss of appetite, skin ulcers, diseases of the heart and blood vessels (cardiovascular disease), fever, diabetes, gum disease (gingivitis), and liver problems. The leaf is also used for birth control and to cause abortions."
    }
  ];

  const promptTemplate = `
You are a specialized Safety and Risk Research Agent.
Query: Investigate the safety profile, toxicological risks, side effects, contraindications, and safe dosage limits of Neem plant parts and Neem oil.

Search Results:
{{searchResultsJson}}

Your task:
1. Extract claims specifically focused on risks, side effects, contraindications, adverse reactions, toxicity, interactions, vulnerable populations, and uncertainties.
2. Every claim must be tied directly to a specific source URL from the provided search results.
3. Do NOT present uncertain safety information as confirmed fact; preserve nuance and hedging where evidence is limited.
4. Do NOT hallucinate sources or URLs.

Output ONLY a JSON object in this exact format:
{
  "summary": "Concise summary of safety profile, major risks, and contraindications",
  "findings": [
    {
      "claim": "Specific risk, side effect, or contraindication claim",
      "url": "Exact source URL from search results",
      "title": "Title of the source",
      "excerpt": "Supporting quote or excerpt describing the risk"
    }
  ]
}
`;

  const prompt = promptTemplate.replace("{{searchResultsJson}}", JSON.stringify(searchResults, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 2500,
        temperature: 0.2
      }
    })
  });

  const resJson = await response.json();
  const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("Raw text output:");
  console.log(text);
}

traceRawOutputsForRealQuery();
