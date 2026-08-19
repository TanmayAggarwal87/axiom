import { createSession, getSessionMeta, saveSessionReport, getSessionReport, getUserSessions, markSessionFailed, deleteSession, deleteUserSessions, inMemoryDb } from "../supabase/db";
import type { SessionBudget } from "../orchestrator/types";

async function runTests() {
  console.log("=================================================");
  console.log("   🧪 RUNNING SESSION ROUTES & HISTORY TESTS    ");
  console.log("=================================================\n");

  const sessionId = `test-session-${Date.now()}`;
  const userId = "test-user-999";
  const query = "Research the medical benefits of Neem plant";

  const budget: SessionBudget = {
    sessionId,
    totalUsdc: 0.50,
    spentUsdc: 0.0,
    maxFactCheckIterations: 2,
    maxDynamicTasks: 3,
  };

  // 1. Test session creation and initial metadata
  console.log("Step 1: Creating session...");
  await createSession(sessionId, userId, budget, query);

  const meta = await getSessionMeta(sessionId);
  console.log("Session Meta:", meta);
  if (!meta || meta.query !== query || meta.status !== "in_progress" || meta.userId !== userId) {
    throw new Error("FAIL: Initial metadata check failed");
  }
  console.log("✅ Step 1 passed: Initial metadata correct.");

  // 2. Test getUserSessions lists it
  console.log("\nStep 2: Checking getUserSessions...");
  const userSessions = await getUserSessions(userId);
  console.log("User Sessions Count:", userSessions.length);
  if (userSessions.length !== 1 || userSessions[0].id !== sessionId || userSessions[0].status !== "in_progress") {
    throw new Error("FAIL: getUserSessions check failed");
  }
  console.log("✅ Step 2 passed: User sessions lists the session in_progress.");

  // 3. Test saveSessionReport and completed status
  console.log("\nStep 3: Saving compiled report...");
  const mockCompiledReport = {
    title: "Axiom Research Report",
    query: query,
    sections: [{ id: "overview", title: "Executive Summary", content: "Prose summary content here" }],
    citations: [],
    factCheckAudit: [],
    payments: [],
    budgetSummary: { totalUsdc: 0.5, spentUsdc: 0.05, remainingUsdc: 0.45 },
    generatedAt: new Date().toISOString()
  };

  await saveSessionReport(sessionId, userId, mockCompiledReport);

  const meta2 = await getSessionMeta(sessionId);
  console.log("Session Meta after saving report:", meta2);
  if (!meta2 || meta2.status !== "completed") {
    throw new Error("FAIL: Status didn't update to 'completed'");
  }
  console.log("✅ Step 3 passed: Status updated to 'completed'.");

  // 4. Test getSessionReport retrieves it
  console.log("\nStep 4: Fetching session report...");
  const retrievedReport = await getSessionReport(sessionId);
  console.log("Retrieved Report Title:", retrievedReport?.title);
  if (!retrievedReport || retrievedReport.title !== mockCompiledReport.title || retrievedReport.query !== query) {
    throw new Error("FAIL: Stored report retrieval failed");
  }
  console.log("✅ Step 4 passed: Report retrieved exactly as saved.");

  // 5. Test getUserSessions lists completed
  console.log("\nStep 5: Recheck getUserSessions...");
  const userSessions2 = await getUserSessions(userId);
  if (userSessions2[0].status !== "completed") {
    throw new Error("FAIL: getUserSessions status not updated");
  }
  console.log("✅ Step 5 passed: User sessions lists the session as completed.");

  // 6. Test markSessionFailed
  console.log("\nStep 6: Marking session failed...");
  const failedSessionId = `failed-session-${Date.now()}`;
  await createSession(failedSessionId, userId, budget, "Failed query");
  await markSessionFailed(failedSessionId);
  const meta3 = await getSessionMeta(failedSessionId);
  console.log("Failed Session Meta:", meta3);
  if (!meta3 || meta3.status !== "failed") {
    throw new Error("FAIL: Status didn't update to 'failed'");
  }
  console.log("✅ Step 6 passed: Status updated to 'failed'.");

  // 7. Test deleteSession
  console.log("\nStep 7: Deleting session...");
  const deleteSuccess = await deleteSession(sessionId);
  if (!deleteSuccess) {
    throw new Error("FAIL: deleteSession call returned false");
  }
  const deletedMeta = await getSessionMeta(sessionId);
  if (deletedMeta !== null) {
    throw new Error("FAIL: Deleted session metadata still exists");
  }
  console.log("✅ Step 7 passed: Session successfully deleted.");

  // 8. Test deleteUserSessions
  console.log("\nStep 8: Clearing user history...");
  const clearSuccess = await deleteUserSessions(userId);
  if (!clearSuccess) {
    throw new Error("FAIL: deleteUserSessions call returned false");
  }
  const remainingSessions = await getUserSessions(userId);
  if (remainingSessions.length !== 0) {
    throw new Error(`FAIL: User sessions still remain: ${remainingSessions.length}`);
  }
  console.log("✅ Step 8 passed: Entire user history successfully cleared.");

  console.log("\n=================================================");
  console.log("   🎉 ALL ROUTING & HISTORY DB TESTS PASSED!     ");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("\n❌ TEST FAILURE:", err);
  process.exit(1);
});
