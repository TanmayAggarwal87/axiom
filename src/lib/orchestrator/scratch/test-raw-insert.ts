import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786420468309-zscw5i2nj";
  console.log("Simulating task_spawned DB inserts directly...");

  const tasksToInsert = [
    {
      id: "neem-general-search-unique",
      session_id: sessionId,
      type: "search",
      input: "Research the Neem plant...",
      depends_on: [],
      status: "ready",
      created_by: "orchestrator",
      result: null
    },
    {
      id: "neem-academic-research-unique",
      session_id: sessionId,
      type: "academic",
      input: "Search academic...",
      depends_on: [],
      status: "ready",
      created_by: "orchestrator",
      result: null
    }
  ];

  for (const t of tasksToInsert) {
    const { data, error } = await supabase.from("tasks").insert(t);
    if (error) {
      console.error(`Error inserting ${t.id}:`, error);
    } else {
      console.log(`Success inserting ${t.id}`);
    }
  }
}

run();
