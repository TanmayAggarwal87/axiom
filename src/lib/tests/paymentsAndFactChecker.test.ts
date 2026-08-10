import http from "http";
import { getTreasuryAddress, BASE_SEPOLIA_USDC } from "../x402/treasury";
import { payAndFetch } from "../x402/payAndFetch";
import { checkAndDebit, getUserCreditBalance, topUpUserCredit } from "../credits";
import { runFactChecker } from "../agents/factChecker";
import { Claim, Evidence, SessionBudget } from "@/types/shared";
import { isAddress } from "viem";

// Set valid environment variables for local integration testing
(process.env as any).NODE_ENV = "test";
process.env.TREASURY_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.STRIPE_SECRET_KEY = "sk_test_valid_mock_key_for_testing";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_valid_mock_secret_for_testing";

/**
 * Axiom Payments & Fact-Checker Integration Test Suite
 */
export async function runPaymentsAndFactCheckerTestSuite() {
  console.log("=================================================");
  console.log("  🚀 AXIOM PAYMENTS & FACT-CHECKER TEST SUITE    ");
  console.log("=================================================\n");

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition?: boolean, testName?: string, detail?: string) {
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(` ❌ FAIL: ${testName} - ${detail || "Assertion failed"}`);
      failedTests++;
    }
  }

  // -----------------------------------------------------------------
  // 1. TEST TREASURY WALLET & USDC CONTRACT ADDRESS
  // -----------------------------------------------------------------
  console.log("--- 1. Testing Treasury Wallet & USDC Address ---");
  try {
    const treasuryAddr = getTreasuryAddress();
    assert(treasuryAddr.startsWith("0x") && treasuryAddr.length === 42, "Treasury Address Format", treasuryAddr);
    assert(isAddress(BASE_SEPOLIA_USDC) && BASE_SEPOLIA_USDC.length === 42, "BASE_SEPOLIA_USDC Valid 40-char Address", BASE_SEPOLIA_USDC);
  } catch (err) {
    assert(false, "Treasury Wallet Setup", (err as Error).message);
  }

  // -----------------------------------------------------------------
  // 2. TEST X402 PAYANDFETCH CLIENT WRAPPER & ERROR HANDLING
  // -----------------------------------------------------------------
  console.log("\n--- 2. Testing x402 payAndFetch Client Wrapper ---");

  const testPort = 38402;
  const serverUrl = `http://localhost:${testPort}/api/x402-resource`;

  const testServer = http.createServer((req, res) => {
    const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Tx-Hash": txHash,
      "X-Payment-Receipt": `rcpt_${txHash.substring(2, 10)}`,
      "X-Payment-Amount": "0.02",
    });
    res.end(
      JSON.stringify({
        title: "Peer-Reviewed Article on Bioactive Neem Extracts",
        confidence: 0.92,
        findings: [{ claim: "Neem contains Azadirachtin", confidence: 0.92 }],
        paymentProof: { txHash, amountUsdc: 0.02 },
      })
    );
  });

  await new Promise<void>((resolve) => testServer.listen(testPort, () => resolve()));

  try {
    const result = await payAndFetch<{ title: string; confidence: number }>(serverUrl, {
      sessionId: "session_test_real",
      agent: "AcademicAgent",
      purpose: "Test paywalled journal access",
    });

    assert(!!result.data && result.data.title.includes("Bioactive Neem"), "payAndFetch returns decoded 200 data");
    assert(result.receipt !== null, "payAndFetch returns non-null PaymentReceipt when paid");
    assert(result.receipt?.network === "eip155:84532", "PaymentReceipt network is eip155:84532");
    assert(
      result.receipt?.txHash.startsWith("0x") && result.receipt.txHash.length === 66,
      "PaymentReceipt txHash valid Base Sepolia format",
      result.receipt?.txHash
    );
  } catch (err) {
    assert(false, "payAndFetch Execution", (err as Error).message);
  } finally {
    testServer.close();
  }

  // -----------------------------------------------------------------
  // 3. TEST USER CREDIT WALLET & ATOMIC DEBIT
  // -----------------------------------------------------------------
  console.log("\n--- 3. Testing Credit Wallet & Atomic Debit ---");
  const userId = "test_user_payments_strict";
  try {
    const initialBal = await getUserCreditBalance(userId);
    assert(typeof initialBal === "number", "Credit balance readable");

    const topUpRes = await topUpUserCredit(userId, 10.0);
    assert(topUpRes.success && topUpRes.newBalance >= 10.0, "Top-up credits wallet ($10.00)");

    const debitRes = await checkAndDebit(userId, 0.02);
    assert(debitRes.success, "checkAndDebit deducts $0.02 for academic call");

    const overDebit = await checkAndDebit(userId, 9999.0);
    assert(!overDebit.success && !!overDebit.error, "checkAndDebit rejects when balance is insufficient");
  } catch (err) {
    assert(false, "Credit Wallet Operations", (err as Error).message);
  }

  // -----------------------------------------------------------------
  // 4. TEST FACT-CHECKER HARD CAPS & DYNAMIC CONFIDENCE
  // -----------------------------------------------------------------
  console.log("\n--- 4. Testing Fact-Checker Iteration & Task Caps ---");

  const fcPort = 38403;
  const fcServerUrl = `http://localhost:${fcPort}/api/x402-resource`;
  const fcServer = http.createServer((req, res) => {
    const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Tx-Hash": txHash,
      "X-Payment-Receipt": `rcpt_${txHash.substring(2, 10)}`,
    });
    res.end(
      JSON.stringify({
        title: "Peer-Reviewed Study",
        confidence: 0.88,
        findings: [{ claim: "Verification finding", confidence: 0.88 }],
      })
    );
  });
  await new Promise<void>((resolve) => fcServer.listen(fcPort, () => resolve()));

  try {
    const mockEvidence: Evidence[] = [];
    const mockClaims: Claim[] = [
      {
        id: "claim_1",
        sessionId: "sess_fc",
        text: "Neem leaves contain active flavonoid compounds.",
        status: "unsupported",
        evidenceIds: [],
        supportedText: null,
      },
    ];

    const budget: SessionBudget = {
      sessionId: "sess_fc",
      totalUsdc: 1.0,
      spentUsdc: 0.0,
      maxFactCheckIterations: 2,
      maxDynamicTasks: 3,
    };

    const fcResult = await runFactChecker({
      sessionId: "sess_fc",
      claims: mockClaims,
      evidence: mockEvidence,
      budget,
      verificationEndpoint: fcServerUrl,
    });

    assert(fcResult.iterationsUsed === 1, "Fact-Checker strictly increments iterationsUsed", `iterationsUsed = ${fcResult.iterationsUsed}`);
    assert(fcResult.totalDynamicTasksSpawned === 1, "Fact-Checker strictly increments totalDynamicTasksSpawned");
    assert(fcResult.newEvidence[0]?.confidence === 0.88, "Evidence confidence derived dynamically from fetched data (0.88)");

    // Test Capped Iterations
    const cappedBudget: SessionBudget = {
      sessionId: "sess_capped",
      totalUsdc: 1.0,
      spentUsdc: 0.0,
      maxFactCheckIterations: 0,
      maxDynamicTasks: 0,
    };

    const cappedResult = await runFactChecker({
      sessionId: "sess_capped",
      claims: [
        {
          id: "claim_unsupported",
          sessionId: "sess_capped",
          text: "Unsubstantiated magic cure claim.",
          status: "unsupported",
          evidenceIds: [],
          supportedText: null,
        },
      ],
      evidence: [],
      budget: cappedBudget,
      verificationEndpoint: fcServerUrl,
    });

    assert(cappedResult.claims[0].status === "insufficient_evidence", "Hard cap enforced when maxFactCheckIterations is 0");
    assert(cappedResult.capReached === true, "capReached flag set to true when limit reached");
  } catch (err) {
    assert(false, "Fact-Checker Execution", (err as Error).message);
  } finally {
    fcServer.close();
  }

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`  SUMMARY: ${passedTests} Passed, ${failedTests} Failed  `);
  console.log("=================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Execute test suite
runPaymentsAndFactCheckerTestSuite().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});