# Task: Integrate & Fix — Combine All 4 Axiom Modules

All 4 modules of Axiom (Orchestrator/State, Search/Academic/Safety Agents, Payments/Credit Wallet/Fact-Checker, Frontend/Report Compiler) have been built independently. Your job now is **not to build new features** — it's to wire them together, find every place where two modules disagree about a shape or a contract, and fix it so the whole system runs end to end.

Before touching anything, read the root `AGENTS.md` in full again — specifically Section 3 (Shared Contracts) and Section 6 ("What done looks like"). That section is your acceptance test for this task.

Use the **ponytail skill** (already installed) to keep any fixes simple — do not refactor or redesign modules while integrating them, only reconcile and repair.

---

## 1. Contract audit (do this first, before running anything)

Go module by module and check every place a module consumes another module's output against the actual shared types in `AGENTS.md` Section 3 (`Task`, `TaskResult`, `SourceRef`, `Evidence`, `Claim`, `PaymentReceipt`, `SessionBudget`, `SessionEvent`). Look specifically for:

- Field name mismatches (e.g. one module wrote `paymentReceiptId`, another expects `receiptId`).
- Type mismatches (e.g. `confidence` stored as a string somewhere instead of a number 0–1).
- One module writing directly to a table that should only be touched through the event-sourced reducer (Section 3's "single writer" rule) — if you find this, fix it to go through the event log instead of patching around it.
- Any module that silently assumes a field will always be present when the type says it's optional/nullable (e.g. `paymentReceiptId: null` on free tasks) — make sure nothing crashes on the null case.
- Function signatures agreed upon between teammates during the build (especially `payAndFetch(url, params, wallet)` between Module 2/3, and `checkAndDebit(userId, amount)` between Module 1/3) — confirm the actual implementations match what both sides assumed, not just what was written in the doc.

List every mismatch you find before fixing anything, so there's a clear record of what was inconsistent.

## 2. Remove leftover scaffolding

Each module was built and tested in isolation against mocks (local JSON fixtures, in-memory arrays, fake user IDs, a locally-run resource server). Find and replace every one of these with the real integration:

- Any hardcoded/mock `Evidence[]` or `Claim[]` fixtures in the Fact-Checker → now reads from real session state via Module 1's API.
- Any local JSON file standing in for Supabase → now reads/writes real tables.
- Any placeholder resource server URL in `payAndFetch` calls → confirm it points at the real intended endpoint(s), not just the module's own test server (unless that test server is intentionally part of the final system — check with the team if unsure, don't assume).
- Any `TODO`, `FIXME`, or obviously-fake data (e.g. `"test-user-123"`, `console.log`-only error handling) left over from solo development.

## 3. Wire the integration in this order (backend before frontend)

1. **Module 1 ↔ Module 2:** Orchestrator creates a real session and task plan, dispatches to the real Search/Academic/Safety agents, confirm results actually land in the event-sourced state correctly (not just that each agent runs, but that the *reducer* applies their output correctly with no race conditions when they finish close together).
2. **Module 1/2 ↔ Module 3:** Confirm the Academic agent's paid calls actually go through the real `payAndFetch`, produce a real `PaymentReceipt`, and that receipt is correctly linked back to its `TaskResult`. Confirm session budget carve-out (Module 1) and `checkAndDebit` (Module 3) agree on the same number for the same task type — this is the exchange-rate rule from `AGENTS.md` Module 3; if the two sides used different numbers during solo development, fix it to one source of truth.
3. **Fact-Checker (Module 3) ↔ real state:** Confirm it now reads real evidence/claims instead of its test fixture, and that the hard caps (`maxFactCheckIterations`, `maxDynamicTasks`) are actually enforced against the real session budget, not a hardcoded test value.
4. **Module 4 ↔ everything:** Wire the frontend's live session view to real Supabase `events` (not mock data), the report view to the real Report Compiler output, and the payment-proof panel to real `PaymentReceipt` rows with real, resolvable Base Sepolia transaction hashes. Confirm the credit wallet UI reflects real balance changes after a real session runs.

## 4. Run one full end-to-end test

Submit one real research query through the actual UI and confirm, without any mocks anywhere in the path:

- Tasks visibly run, some in parallel.
- At least one real x402 payment happens; its transaction hash resolves on `sepolia.basescan.org`.
- The Fact-Checker either verifies cleanly or — within its capped limit — spawns exactly one additional task and incorporates it (test this deliberately at least once; don't just accept "it didn't trigger" as proof it works).
- The hard caps actually stop the loop if you force a low-confidence scenario — verify this doesn't run away.
- The final report renders with inline citations and a visible payment-proof section.
- The user's credit balance decreases by an amount that matches what was actually spent (spot-check the arithmetic, don't just eyeball that it went down).

## 5. Non-negotiables (unchanged from AGENTS.md)

- No real money — Base Sepolia + test USDC + Stripe test mode only, still.
- No wagmi, no Hardhat, no Claude/Anthropic API calls anywhere.
- If you find a genuine design disagreement between two modules (not just a naming bug, but two people who built against different assumptions), **stop and flag it to the team rather than picking one side yourself** — this is exactly the kind of decision that needs a human call, not a guess.

Report back: the list of mismatches found in Step 1, what was removed in Step 2, and the result of the Step 4 end-to-end test — pass/fail on each bullet, not just an overall "it works."