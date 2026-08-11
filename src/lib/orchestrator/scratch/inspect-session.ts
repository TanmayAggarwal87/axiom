import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Resolve using absolute path of the workspace root
dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  console.log("Querying Supabase for sessionId:", sessionId);
  
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, created_by, status, session_id")
    .eq("session_id", sessionId);

  if (tasksError) {
    console.error("Error fetching tasks:", tasksError);
  } else {
    console.log("Tasks found:", tasks);
  }
}

run();
