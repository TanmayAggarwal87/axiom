import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  console.log("Querying Supabase events for sessionId:", sessionId);
  
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, type, payload, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (eventsError) {
    console.error("Error fetching events:", eventsError);
  } else {
    console.log("Events found:", events);
  }
}

run();
