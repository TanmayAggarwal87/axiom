import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786420588429-yuwgst93a";
  console.log("Fetching events of type task_failed...");
  
  const { data: events } = await supabase
    .from("events")
    .select("type, payload")
    .eq("session_id", sessionId)
    .eq("type", "task_failed");

  console.log("Failed tasks events payload:", JSON.stringify(events, null, 2));
}

run();
