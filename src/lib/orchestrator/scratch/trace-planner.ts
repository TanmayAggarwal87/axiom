import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const apiKey = process.env.GEMINI_API_KEY || "";

async function tracePlannerOutput() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const prompt = `You are the core planner of Axiom, an autonomous research orchestrator.
Decompose the following user research query into a structured, dependency-aware list of tasks.

User Query: "Recent breakthroughs in quantum computing and practical applications"

You MUST output ONLY a valid JSON object matching this schema:
{
  "tasks": [
    {
      "id": "unique-task-id-1",
      "type": "search",
      "input": "specific detailed search query or instruction for the task",
      "dependsOn": []
    }
  ]
}

CRITICAL RULES:
1. The research plan must contain at least one "search" task, one "academic" task, and one "safety" task.
2. The "synthesize" task must depend on the "search", "academic", and "safety" tasks.
3. The "compile" task must depend on the "synthesize" task.
4. "dependsOn" is an array of IDs of the tasks that must complete before this task can start.
5. Task types must ONLY be one of: "search", "academic", "safety", "synthesize", "compile" (do NOT output "factcheck" for initial planning; the fact-checker is spawned dynamically).
6. Do NOT include any explanations, markdown code blocks, or text outside the JSON. Return ONLY the raw JSON string.`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    })
  });

  const resJson = await response.json();
  const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("Raw Planner text output:");
  console.log(text);
}

tracePlannerOutput();
