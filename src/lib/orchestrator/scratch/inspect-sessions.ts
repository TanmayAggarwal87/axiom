import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking active database session instances...");
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(3);

  for (const s of sessions || []) {
    const { data: tasks } = await supabase.from("tasks").select("id, type, status").eq("session_id", s.id);
    console.log(`Session: ${s.id} (${s.created_at})`);
    tasks?.forEach(t => {
      console.log(`  - Type: ${t.type}, Status: ${t.status}, ID: ${t.id}`);
    });
  }
}

run();
