import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786420186369-b8wwlskn6";
  console.log("Inspecting statuses for session:", sessionId);
  
  const { data: tasks } = await supabase.from("tasks").select("*").eq("session_id", sessionId);

  console.log("Tasks:");
  tasks?.forEach(t => {
    console.log(`- Type: ${t.type}, Status: ${t.status}, ID: ${t.id}`);
  });
}

run();
