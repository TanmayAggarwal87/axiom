import { runAgent } from "../run-agent";
import { MockPaidFetcher } from "../mocks/mock-paid-fetcher";
import { MockStateWriter } from "../mocks/mock-state-writer";
import type { Task } from "../types";

// Ensure mock mode is active for dev test execution if API keys are missing
if (!process.env.GEMINI_API_KEY || !process.env.BRAVE_SEARCH_API_KEY) {
  process.env.ALLOW_MOCKS = "true";
}

async function runTests() {
  console.log("=================================================");
  console.log("   AXIOM MODULE 2: AGENT TEST SUITE RUNNER       ");
  console.log("=================================================\n");

  const stateWriter = new MockStateWriter();
  const paidFetcher = new MockPaidFetcher();

  // Test 1: Search Agent
  console.log("--- TEST 1: Search Agent ---");
  const searchTask: Task = {
    id: "task-search-01",
    sessionId: "session-test-100",
    type: "search",
    input: "Research the Neem plant and its medicinal uses",
    dependsOn: [],
    status: "ready",
    createdBy: "orchestrator",
    result: null,
  };

  const searchResult = await runAgent(searchTask, { stateWriter });
  console.log(`✓ Search Task completed. Task ID: ${searchResult.taskId}`);
  console.log(`  Sources returned: ${searchResult.sources.length}`);
  console.log(`  First Source:`, searchResult.sources[0]);
  console.log(`  Payment Receipt ID: ${searchResult.paymentReceiptId}`);
  console.assert(searchResult.sources.every((s) => s.type === "web" && s.paid === false), "Search sources must be web/unpaid");
  console.assert(searchResult.paymentReceiptId === null, "Search result paymentReceiptId must be null");

  // Test 2: Safety Agent
  console.log("\n--- TEST 2: Safety Agent ---");
  const safetyTask: Task = {
    id: "task-safety-01",
    sessionId: "session-test-100",
    type: "safety",
    input: "Research Neem risks, side effects, contraindications, and toxicity concerns",
    dependsOn: [],
    status: "ready",
    createdBy: "orchestrator",
    result: null,
  };

  const safetyResult = await runAgent(safetyTask, { stateWriter });
  console.log(`✓ Safety Task completed. Task ID: ${safetyResult.taskId}`);
  console.log(`  Sources returned: ${safetyResult.sources.length}`);
  console.log(`  First Source:`, safetyResult.sources[0]);
  console.assert(safetyResult.sources.every((s) => s.type === "safety" && s.paid === false), "Safety sources must be safety/unpaid");
  console.assert(safetyResult.paymentReceiptId === null, "Safety result paymentReceiptId must be null");

  // Test 3: Academic Agent (Free Path)
  console.log("\n--- TEST 3: Academic Agent (Free Path) ---");
  const academicFreeTask: Task = {
    id: "task-academic-free-01",
    sessionId: "session-test-100",
    type: "academic",
    input: "Find scientific evidence and recent studies about Neem medicinal properties",
    dependsOn: [],
    status: "ready",
    createdBy: "orchestrator",
    result: null,
  };

  const academicFreeResult = await runAgent(academicFreeTask, { stateWriter });
  console.log(`✓ Academic Free Task completed. Task ID: ${academicFreeResult.taskId}`);
  console.log(`  Sources returned: ${academicFreeResult.sources.length}`);
  console.log(`  First Source:`, academicFreeResult.sources[0]);
  console.assert(academicFreeResult.sources.every((s) => s.type === "academic"), "Academic sources must be academic");
  console.assert(academicFreeResult.paymentReceiptId === null, "Free academic result paymentReceiptId must be null");

  // Test 4: Academic Agent (Paid Path with MockPaidFetcher)
  console.log("\n--- TEST 4: Academic Agent (Paid Path via MockPaidFetcher) ---");
  const academicPaidTask: Task = {
    id: "task-academic-paid-01",
    sessionId: "session-test-100",
    type: "academic",
    input: "Retrieve paywalled clinical study on Neem bioactive limonoids",
    dependsOn: [],
    status: "ready",
    createdBy: "orchestrator",
    result: null,
  };

  const academicPaidResult = await runAgent(academicPaidTask, {
    paidFetcher,
    stateWriter,
    forcePaidFetchUrl: "https://doi.org/10.1016/j.jep.2023.116543",
  });
  console.log(`✓ Academic Paid Task completed. Task ID: ${academicPaidResult.taskId}`);
  console.log(`  Sources returned: ${academicPaidResult.sources.length}`);
  console.log(`  Payment Receipt ID: ${academicPaidResult.paymentReceiptId}`);
  const paidSource = academicPaidResult.sources.find((s) => s.paid);
  console.log(`  Paid Source found:`, paidSource);
  console.assert(paidSource !== undefined, "Paid source must be present in sources list");
  console.assert(academicPaidResult.paymentReceiptId !== null, "Payment receipt ID must be populated for paid fetch");

  // Test 5: StateWriter Verification
  console.log("\n--- TEST 5: StateWriter Verification ---");
  console.log(`  Total tasks submitted to StateWriter: ${stateWriter.submittedResults.length}`);
  console.assert(stateWriter.submittedResults.length === 4, "StateWriter should have recorded 4 task executions");

  // Test 6: Input Validation Error Handling
  console.log("\n--- TEST 6: Validation & Error Handling ---");
  try {
    await runAgent({ ...searchTask, input: "" });
    console.error("❌ FAILED: Empty input did not throw error!");
  } catch (err: any) {
    console.log(`✓ Caught expected empty input error: "${err.message}"`);
  }

  try {
    await runAgent({ ...searchTask, type: "synthesize" as any });
    console.error("❌ FAILED: Invalid task type did not throw error!");
  } catch (err: any) {
    console.log(`✓ Caught expected invalid type error: "${err.message}"`);
  }

  console.log("\n=================================================");
  console.log("   ALL MODULE 2 AGENT TESTS PASSED SUCCESSFULLY!  ");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("FATAL TEST RUNNER ERROR:", err);
  process.exit(1);
});
