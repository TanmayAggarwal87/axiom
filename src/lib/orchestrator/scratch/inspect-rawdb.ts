import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  console.log("Directly checking Supabase tables for session:", sessionId);
  
  const { data: session } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
  const { data: budget } = await supabase.from("budgets").select("*").eq("session_id", sessionId).single();
  const { data: tasks } = await supabase.from("tasks").select("*").eq("session_id", sessionId);

  console.log("Session row:", session);
  console.log("Budget row:", budget);
  console.log("Tasks rows length:", tasks?.length, "Rows:", tasks);
}

run();
