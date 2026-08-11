import { getSessionState } from "../../supabase/db";
import * as dotenv from "dotenv";

dotenv.config({ path: "c:/Users/Akshat/Downloads/hackathon/axiom/.env" });

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  console.log("Calling getSessionState for sessionId:", sessionId);
  const state = await getSessionState(sessionId);
  console.log("State retrieved:", JSON.stringify(state, null, 2));
}

run();
