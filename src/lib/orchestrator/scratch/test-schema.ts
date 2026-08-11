import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const apiKey = process.env.GEMINI_API_KEY || "";

async function testResponseSchema() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const prompt = "Explain quantum computing in 1 sentence.";

  const schema = {
    type: "OBJECT",
    properties: {
      explanation: { type: "STRING" }
    },
    required: ["explanation"]
  };

  console.log("Testing with responseSchema...");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2
      }
    })
  });

  console.log("Response status:", response.status);
  const text = await response.text();
  console.log("Response body:", text);
}

testResponseSchema();
