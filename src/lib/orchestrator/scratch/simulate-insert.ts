import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  console.log("Simulating first event insertion to see error logs...");

  const testEvent = {
    id: "evt-spawn-1786419020921-3ogcw564a",
    session_id: sessionId,
    type: "task_spawned",
    payload: {
      id: "search-quantum-breakthroughs",
      type: "search",
      input: "Search for recent industry breakthroughs, hardware milestones, and commercial announcements in quantum computing from 2023 to present.",
      result: null,
      status: "ready",
      createdBy: "orchestrator",
      dependsOn: [],
      sessionId: sessionId
    },
    created_at: "2026-08-11T03:30:20.921+00:00"
  };

  // Run the code from db.ts manually
  const currentDynamicTasks = 0; // Filtered dynamic count for orchestrator is 0
  const limit = 3;
  if (currentDynamicTasks < limit) {
    const { data, error } = await supabase.from("tasks").insert({
      id: testEvent.payload.id,
      session_id: sessionId,
      type: testEvent.payload.type,
      input: testEvent.payload.input,
      depends_on: testEvent.payload.dependsOn,
      status: testEvent.payload.status,
      created_by: testEvent.payload.createdBy,
      result: testEvent.payload.result,
    });

    if (error) {
      console.error("Supabase insert error details:", error);
    } else {
      console.log("Supabase insert succeeded!");
    }
  }
}

run();
