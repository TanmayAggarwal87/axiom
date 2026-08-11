import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786420186369-b8wwlskn6";
  console.log("Direct insert check...");

  const task = {
    id: "neem-general-search",
    type: "search",
    input: "Research the Neem plant...",
    dependsOn: [],
    status: "ready",
    createdBy: "orchestrator",
    result: null
  };

  const { data, error } = await supabase.from("tasks").insert({
    id: task.id,
    session_id: sessionId,
    type: task.type,
    input: task.input,
    depends_on: task.dependsOn,
    status: task.status,
    created_by: task.createdBy,
    result: task.result,
  });

  if (error) {
    console.error("Direct insert error:", error);
  } else {
    console.log("Direct insert result:", data);
  }
}

run();
