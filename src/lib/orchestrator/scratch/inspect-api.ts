import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  console.log("Checking API session endpoint payload directly...");
  
  const response = await fetch(`http://localhost:3000/api/research/session/${sessionId}`);
  const data = await response.json();
  console.log("API response status:", response.status);
  console.log("API response success:", data.success);
  console.log("API response state tasks length:", data?.state?.tasks?.length);
  console.log("API response state tasks:", JSON.stringify(data?.state?.tasks, null, 2));
}

run();
