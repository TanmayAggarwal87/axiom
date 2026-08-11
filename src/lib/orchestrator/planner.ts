import type { Task } from "./types";

const GEMINI_MODEL = "gemini-3.5-flash";

function isMockAllowed(): boolean {
  return process.env.ALLOW_MOCKS === "true" || process.env.NODE_ENV === "test";
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  if (!key) {
    if (isMockAllowed()) {
      return "";
    }
    throw new Error("Missing required environment variable GEMINI_API_KEY.");
  }
  return key;
}

/**
 * Plans research by calling Gemini to decompose a raw query into a structured research plan.
 */
export async function planResearch(sessionId: string, query: string): Promise<Task[]> {
  if (!query || query.trim() === "") {
    throw new Error("Query cannot be empty.");
  }

  const apiKey = getApiKey();
  const prompt = `You are the core planner of Axiom, an autonomous research orchestrator.
Decompose the following user research query into a structured, dependency-aware list of tasks.

User Query: "${query}"

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

  let parsed: any = null;

  if (!apiKey && isMockAllowed()) {
    console.warn("[Planner] Missing GEMINI_API_KEY in mock mode. Returning mock research plan.");
    parsed = getMockPlan(sessionId);
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const plannerSchema = {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["search", "academic", "safety", "synthesize", "compile"] },
              input: { type: "string" },
              dependsOn: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["id", "type", "input", "dependsOn"]
          }
        }
      },
      required: ["tasks"]
    };

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
          responseSchema: plannerSchema,
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API planner call failed with status ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) {
      throw new Error("Gemini returned empty response for planning.");
    }

    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      // Try to strip potential markdown codeblocks
      const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }
  }

  // Validate Gemini JSON output
  if (!parsed || !Array.isArray(parsed.tasks)) {
    throw new Error("Invalid planning format: Root object must contain a 'tasks' array.");
  }

  const tasks: Task[] = [];
  const validTypes = new Set(["search", "academic", "safety", "synthesize", "compile"]);

  // Generate unique task IDs to avoid primary key constraints in DB
  const idMapping: Record<string, string> = {};
  for (const t of parsed.tasks) {
    if (t.id && typeof t.id === "string") {
      idMapping[t.id] = `${t.id}-${Math.random().toString(36).substr(2, 5)}`;
    }
  }

  for (const t of parsed.tasks) {
    if (!t.id || typeof t.id !== "string") {
      throw new Error("Invalid task format: Missing or invalid task ID.");
    }
    if (!t.type || !validTypes.has(t.type)) {
      throw new Error(`Invalid task format: Unsupported task type "${t.type}".`);
    }
    if (!t.input || typeof t.input !== "string") {
      throw new Error("Invalid task format: Missing or invalid input field.");
    }
    if (!Array.isArray(t.dependsOn)) {
      throw new Error("Invalid task format: dependsOn must be an array of strings.");
    }

    const uniqueId = idMapping[t.id];
    const uniqueDependsOn = t.dependsOn
      .map((depId: string) => idMapping[depId])
      .filter((mappedId: string | undefined) => !!mappedId);

    tasks.push({
      id: uniqueId,
      sessionId,
      type: t.type as any,
      input: t.input,
      dependsOn: uniqueDependsOn,
      status: uniqueDependsOn.length === 0 ? "ready" : "pending",
      createdBy: "orchestrator",
      result: null,
    });
  }

  // Ensure at least search, academic, and safety tasks exist
  const typesPresent = new Set(tasks.map((t) => t.type));
  if (!typesPresent.has("search") || !typesPresent.has("academic") || !typesPresent.has("safety")) {
    throw new Error("Invalid planning: The plan must contain at least 'search', 'academic', and 'safety' tasks.");
  }

  // Validate dependency references and detect cycles
  validateDependencies(tasks);

  return tasks;
}

/**
 * Validates that all dependsOn references exist and that there are no dependency cycles.
 * Uses topological sort (Kahn's algorithm) to detect cycles.
 * Throws immediately on invalid plans rather than letting the executor hang.
 */
function validateDependencies(tasks: Task[]): void {
  const taskIds = new Set(tasks.map((t) => t.id));

  // Check for dangling references
  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        throw new Error(
          `Invalid plan: Task "${task.id}" depends on "${depId}" which does not exist in the plan.`
        );
      }
    }
  }

  // Topological sort to detect cycles (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.id, task.dependsOn.length);
    if (!adjacency.has(task.id)) {
      adjacency.set(task.id, []);
    }
    for (const depId of task.dependsOn) {
      if (!adjacency.has(depId)) {
        adjacency.set(depId, []);
      }
      adjacency.get(depId)!.push(task.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let sortedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedCount++;
    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sortedCount !== tasks.length) {
    const cycledTasks = tasks
      .filter((t) => (inDegree.get(t.id) || 0) > 0)
      .map((t) => `${t.id} (depends on: ${t.dependsOn.join(", ")})`)
      .join("; ");
    throw new Error(
      `Invalid plan: Dependency cycle detected among tasks: ${cycledTasks}. ` +
      `A plan with circular dependencies would hang forever.`
    );
  }
}

function getMockPlan(sessionId: string): any {
  return {
    tasks: [
      {
        id: "task-search-1",
        type: "search",
        input: "General search on Neem bioactive compounds and traditional medicinal uses",
        dependsOn: [],
      },
      {
        id: "task-academic-1",
        type: "academic",
        input: "Academic literature review on Neem limonoids, particularly azadirachtin and nimbin",
        dependsOn: [],
      },
      {
        id: "task-safety-1",
        type: "safety",
        input: "Toxicity profile and contraindications of Neem seed oil and leaf extract ingestion",
        dependsOn: [],
      },
      {
        id: "task-synthesize-1",
        type: "synthesize",
        input: "Synthesize the therapeutic benefits vs safety risks of medicinal Neem usage",
        dependsOn: ["task-search-1", "task-academic-1", "task-safety-1"],
      },
      {
        id: "task-compile-1",
        type: "compile",
        input: "Compile the final research report with structured citations and cost breakdown",
        dependsOn: ["task-synthesize-1"],
      },
    ],
  };
}
