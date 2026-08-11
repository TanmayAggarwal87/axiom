import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Setting default-user credits to 100.0000...");
  
  const { data, error } = await supabase
    .from("users")
    .update({ credits: 100.0000 })
    .eq("id", "default-user");

  if (error) {
    console.error("Error setting credits:", error);
  } else {
    console.log("Successfully set user credits to 100!");
  }
}

run();
