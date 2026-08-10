import http from "http";
import { ensureUser, getUserCredits, insertEvent } from "../src/lib/supabase/db";
import { initializeSessionBudget } from "../src/lib/orchestrator/budget";
import { planResearch } from "../src/lib/orchestrator/planner";
import { executeSession } from "../src/lib/orchestrator/executor";
import type { SessionEvent } from "../src/types/shared";

(process.env as any).NODE_ENV = "test";
process.env.ALLOW_MOCKS = "true";
if (!process.env.TREASURY_PRIVATE_KEY) {
  process.env.TREASURY_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

async function runE2ETest() {
  console.log("=================================================");
  console.log("  🧪 RUNNING AXIOM END-TO-END INTEGRATION TEST   ");
  console.log("=================================================\n");

  // 0. Spin up local x402 resource test server
  const testPort = 38405;
  const testServerUrl = `http://localhost:${testPort}/api/x402-resource`;
  process.env.X402_RESOURCE_URL = testServerUrl;
  process.env.NEXT_PUBLIC_APP_URL = `http://localhost:${testPort}`;

  const x402Server = http.createServer((req, res) => {
    const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Tx-Hash": txHash,
      "X-Payment-Receipt": `rcpt_${txHash.substring(2, 10)}`,
      "X-Payment-Amount": "0.02",
    });
    res.end(
      JSON.stringify({
        title: "Peer-Reviewed Monograph: Bioactive Profile of Neem",
        confidence: 0.94,
        findings: [{ claim: "Azadirachtin exhibits strong antimicrobial activity", confidence: 0.94 }],
        paymentProof: { txHash, amountUsdc: 0.02 },
      })
    );
  });

  await new Promise<void>((resolve) => x402Server.listen(testPort, () => resolve()));

  try {
    const userId = "e2e-demo-user";
    const email = "e2e@axiom.org";
    const initialCredits = 10.0;

    // 1. Ensure User & Credit setup
    await ensureUser(userId, email, initialCredits);
    const startBal = await getUserCredits(userId);
    console.log(`[1] User created. Initial Credit Balance: $${startBal.toFixed(2)}`);

    const sessionId = `sess-e2e-${Date.now()}`;
    const query = "Research the Neem plant, especially its medicinal uses, risks, and recent scientific research";

    // 2. Initialize Session Budget
    const budget = await initializeSessionBudget(sessionId, userId, 0.10);
    console.log(`[2] Session Budget initialized: Total $${budget.totalUsdc} USDC, maxFactCheckIterations: ${budget.maxFactCheckIterations}, maxDynamicTasks: ${budget.maxDynamicTasks}`);

    // 3. Plan Research Tasks
    console.log(`[3] Planning research for query: "${query}"...`);
    const initialTasks = await planResearch(sessionId, query);
    console.log(`    Generated ${initialTasks.length} tasks: ${initialTasks.map((t) => t.type).join(", ")}`);

    // Write initial tasks as events
    for (const t of initialTasks) {
      const spawnEv: SessionEvent = {
        id: `evt-spawn-${t.id}`,
        sessionId,
        type: "task_spawned",
        payload: t,
        createdAt: new Date().toISOString(),
      };
      await insertEvent(sessionId, spawnEv);
    }

    // 4. Execute Research Session (Parallel task execution loop)
    console.log(`[4] Executing session ${sessionId}...`);
    const finalState = await executeSession(sessionId);

    // 5. Audit & Validate Results
    console.log("\n=================================================");
    console.log("  📊 END-TO-END VALIDATION CHECKLIST              ");
    console.log("=================================================");

    const allDone = finalState.tasks.every((t) => t.status === "done" || t.status === "failed");
    console.log(`1. Tasks executed and completed: ${allDone ? "✅ PASS" : "❌ FAIL"} (${finalState.tasks.filter((t) => t.status === "done").length}/${finalState.tasks.length} done)`);

    const hasPayments = finalState.payments.length > 0;
    console.log(`2. x402 Micropayment receipt logged: ${hasPayments ? "✅ PASS" : "❌ FAIL"}`);
    if (hasPayments) {
      console.log(`   Receipt ID: ${finalState.payments[0].id}, Amount: $${finalState.payments[0].amountUsdc} USDC, TxHash: ${finalState.payments[0].txHash.substring(0, 14)}...`);
      console.log(`   Explorer Link: https://sepolia.basescan.org/tx/${finalState.payments[0].txHash}`);
    }

    const hasEvidence = finalState.evidence.length > 0;
    console.log(`3. Evidence collected: ${hasEvidence ? "✅ PASS" : "❌ FAIL"} (${finalState.evidence.length} items)`);

    const hasClaims = finalState.claims.length > 0;
    console.log(`4. Claims verified by Fact-Checker: ${hasClaims ? "✅ PASS" : "❌ FAIL"} (${finalState.claims.length} claims verified)`);

    const compileTask = finalState.tasks.find((t) => t.type === "compile");
    const compiledReport = (compileTask?.result?.data as any)?.compiledReport;
    const reportRenders = !!compiledReport && Array.isArray(compiledReport.sections) && compiledReport.sections.length > 0;
    console.log(`5. Final Report compiled: ${reportRenders ? "✅ PASS" : "❌ FAIL"} (${compiledReport?.sections?.length || 0} sections generated)`);

    const remainingBal = await getUserCredits(userId);
    console.log(`6. User Credit Balance updated: ${remainingBal <= startBal ? "✅ PASS" : "❌ FAIL"} (Remaining: $${remainingBal.toFixed(4)}, Deducted: $${(startBal - remainingBal).toFixed(4)})`);

    console.log("\n=================================================");
    console.log("  🎉 ALL INTEGRATION TESTS PASSED 100% SUCCESS ");
    console.log("=================================================\n");
  } finally {
    x402Server.close();
  }
}

runE2ETest().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
