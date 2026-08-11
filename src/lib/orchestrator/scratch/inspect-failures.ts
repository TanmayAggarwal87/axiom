import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking events for the latest session to find failure reasons...");
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!sessions || sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  const latestSessionId = sessions[0].id;
  console.log("Latest Session ID:", latestSessionId);

  const { data: events } = await supabase
    .from("events")
    .select("type, payload, created_at")
    .eq("session_id", latestSessionId)
    .order("created_at", { ascending: true });

  events?.forEach(e => {
    console.log(`- Event: ${e.type} (${e.created_at})`);
    console.log(`  Payload:`, JSON.stringify(e.payload));
  });
}

run();
