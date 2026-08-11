import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786420468309-zscw5i2nj";
  console.log("Checking events for active session:", sessionId);
  
  const { data: events } = await supabase.from("events").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
  events?.forEach(e => {
    console.log(`- Event: ${e.type}, Payload:`, JSON.stringify(e.payload));
  });

  const { data: tasks } = await supabase.from("tasks").select("*").eq("session_id", sessionId);
  console.log("Tasks in DB:");
  tasks?.forEach(t => {
    console.log(`  - Type: ${t.type}, Status: ${t.status}, ID: ${t.id}`);
  });
}

run();
