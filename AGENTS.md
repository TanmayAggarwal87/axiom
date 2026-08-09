<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Build Prompt: Axiom — Autonomous Research Orchestrator with x402 Micropayments

**Project name: Axiom.** Use this name consistently in  README, page titles, and any user-facing branding.

Read this entire document before writing any code, even if you are only assigned one module. Every module depends on shared contracts defined in Section 3 — if you don't understand the whole system, you will build something that doesn't integrate.

---

## 1. Project Overview (read this first, regardless of your module)

We are building a multi-agent AI research system. A user submits a research query (e.g. *"Research the Neem plant, especially its medicinal uses, risks, and recent scientific research"*). The system autonomously:

1. **Decomposes** the query into a research plan (a set of tasks).
2. **Dispatches** specialized agents in parallel to gather information — a Search agent, an Academic agent, and a Safety/Risk agent.
3. Some of these agents need to pay for premium data sources (e.g. a paywalled research paper). They do this **autonomously**, in real time, using the **x402 payment protocol** — an HTTP-native micropayment standard where a server responds `402 Payment Required`, the agent signs a stablecoin payment, and the resource is released. We are using **Base Sepolia testnet** (chain id `eip155:84532`) with **test USDC**, so this costs no real money during development.
4. A **Fact-Checker agent** reviews all claims gathered against the evidence collected. If a claim is unsupported, it can be flagged, downgraded, or trigger a small amount of *additional* targeted research (capped — see non-negotiable rules).
5. A **Synthesizer** turns verified claims + evidence into a coherent narrative.
6. A **Report Compiler** renders the final report with inline citations, sources, and a transparent breakdown of which sources were paid for (with on-chain payment proof).
7. Users don't touch crypto. They **top up an in-app credit wallet** with real money (fiat, via a payment provider). The system deducts credits per research session. Behind the scenes, a single **platform-owned treasury wallet** is what actually pays the x402 endpoints in test USDC — the user-facing credit system and the on-chain x402 settlement system are two separate layers connected by one exchange-rate rule (see Module 3).

**Why this matters / the story we're telling:** this is not just an LLM pipeline. It's a system of independent agents that autonomously transact for information, with full observability (every task, every piece of evidence, every payment is logged and traceable), and hard safety limits so nothing runs away in cost or time.

**High-level flow:**

```
User query
  → Orchestrator (plans tasks)
  → Shared Session State (tasks, evidence, claims, budget, payments, events)
  → [Search Agent | Academic Agent | Safety Agent] run in parallel
        → each may call free APIs OR paid x402 APIs (Academic agent is the primary paid one)
  → Evidence Store
  → Fact-Checker Agent (verifies claims against evidence; capped re-search loop; may pay for a
     second opinion / verification source)
  → Synthesizer (turns verified claims into narrative)
  → Report Compiler (final report + citations + payment proof)
  → User sees report + updated credit balance
```

This combines what would normally be a "safe v1" (fixed pipeline, no surprises) and a "stretch v2" (dynamic task creation by the fact-checker) into **one single build** — but the dynamic part is *heavily bounded* by hard caps so it can't spiral. Do not remove the caps to "simplify" — they are load-bearing for demo reliability.

---

## 2. Tech Stack (do not substitute or add other tools without asking)

- **Framework:** Next.js (App Router), TypeScript throughout.
- **Backend:** Next.js API routes / Route Handlers — no separate backend service.
- **Database:** Supabase (Postgres). We need it — this is not optional. Reasons: we need durable, queryable storage for research sessions, tasks, evidence, claims, payment receipts, an events log, and user credit balances. This can't live in memory or in the client; sessions must survive page reloads and multiple users must be isolated from each other's data.
- **Auth:** Supabase Auth (email or magic link is enough — keep it simple, this is not the focus of the project).
- **LLMs:** Gemini API and Grok API only. Use Gemini as the default/primary model for planning, agent reasoning, and synthesis. Grok may be used as an alternative/fallback or for a specific agent if your module owner prefers — document which model each call uses. Do not introduce any other model provider.
- **Search:** Tavily Search API for general web search.
- **Payments:** x402 protocol on **Base Sepolia** testnet, settling in test USDC, via the free community facilitator at `https://x402.org/facilitator`. Stack: **viem** for account/key handling and transaction signing, plus **x402-fetch** (or the equivalent `@x402/fetch` + `@x402/evm` + `@x402/core` packages — confirm current package names on install) wrapping `fetch` to handle the `402 → sign → retry → 200` flow automatically. Do **not** add wagmi (that's for connecting a user's browser wallet — we have no user-facing wallet UI, the treasury wallet is server-side only) or Hardhat (that's for writing/deploying custom smart contracts — we aren't deploying any; x402 uses standard USDC transfers).
- **Fiat top-up:** Stripe (test mode) for the user-facing credit wallet.
- **Styling:** Keep it simple — Tailwind is fine. Do not spend disproportionate time on visual polish before the pipeline works end-to-end.
- **UI components: shadcn/ui is already installed in this repo.** Do not run `npx shadcn init` or reinstall/reconfigure it. Just import and implement components (`Button`, `Card`, `Badge`, etc.) directly from `@/components/ui/...` as you build. If a specific component you need hasn't been added yet, do not install it individually mid-build — instead, list it and see Section 7 for the single consolidated install command that gets run once, at the end.
- **Icons:** use `lucide-react` for all icons. It's a standard dependency, already compatible with shadcn — no separate icon library.

---

## 3. Shared Contracts (all 4 modules must use these exact shapes)

These TypeScript types are the "handshake" between modules. If you need to change one, don't just change it — flag it, because another module depends on it.

```typescript
// A single unit of work in the research plan
type Task = {
  id: string;
  sessionId: string;
  type: "search" | "academic" | "safety" | "factcheck" | "synthesize" | "compile";
  input: string | null;
  dependsOn: string[];       // ids of tasks that must complete first
  status: "pending" | "ready" | "running" | "done" | "failed";
  createdBy: "orchestrator" | "factchecker"; // factchecker = dynamically spawned task
  result: TaskResult | null;
};

type TaskResult = {
  taskId: string;
  data: unknown;             // shape depends on task type
  sources: SourceRef[];
  paymentReceiptId: string | null; // set if this task involved an x402 payment
};

type SourceRef = {
  title: string;
  url: string;
  type: "web" | "academic" | "safety";
  paid: boolean;
};

type Evidence = {
  id: string;
  sessionId: string;
  claim: string;
  source: SourceRef;
  agent: string;
  confidence: number;        // 0–1, deterministic score, not vibes — see Module 2 rules
};

type Claim = {
  id: string;
  sessionId: string;
  text: string;
  status: "supported" | "partially_supported" | "unsupported" | "insufficient_evidence";
  evidenceIds: string[];
  supportedText: string | null; // fact-checker's corrected/hedged version, if different
};

type PaymentReceipt = {
  id: string;
  sessionId: string;
  agent: string;
  amountUsdc: number;
  network: "eip155:84532";   // Base Sepolia — hardcode for this project
  txHash: string;
  facilitator: string;
  purpose: string;
  createdAt: string;
};

type SessionBudget = {
  sessionId: string;
  totalUsdc: number;         // carved out of the user's credit wallet at session start
  spentUsdc: number;
  maxFactCheckIterations: number;  // hard cap, default 2
  maxDynamicTasks: number;         // hard cap, default 3
};

type SessionEvent = {
  id: string;
  sessionId: string;
  type: "task_started" | "task_completed" | "payment_made" | "evidence_added" |
        "task_spawned" | "budget_capped" | "report_generated";
  payload: unknown;
  createdAt: string;
};
```

**State-writing rule (applies to every module touching session state):** agents do not write directly to shared tables from parallel processes. Every state change is written as a `SessionEvent` first (insert into the `events` table), and a single reducer function applies events to derived state (tasks/evidence/claims/budget) in order. This avoids race conditions when multiple agents finish around the same time. Do not take a shortcut here — this was a specifically identified failure mode in planning and it is non-negotiable.

---

## 4. Non-Negotiable Rules (apply to all 4 modules, all 4 people)

1. **Write simple code. Do not overcomplicate.** No unnecessary abstraction layers, no premature generalization, no clever tricks. If a plain function does the job, use a plain function.
2. **Read the other modules' sections before building yours.** You need the gist of the whole system (Section 1) even if you're only building one part, because your module's inputs/outputs connect directly to someone else's.
3. **Stay inside your assigned module.** Do not build features from another module "while you're at it" — this causes merge conflicts and duplicated logic. If you think another module needs something changed, say so, don't just change it.
4. **If anything is ambiguous or unclear, ask — do not guess.** This applies to: unclear requirements, unclear interfaces, unclear file locations, unclear naming, missing details in this doc, or anything where two reasonable people could implement it differently. Guessing wrong here wastes more time than asking does. Stop and ask before proceeding.
5. **Hard caps on the fact-check/dynamic-task loop are mandatory, not optional.** `maxFactCheckIterations` (default 2) and `maxDynamicTasks` (default 3) must be enforced in code, not left to the LLM's discretion. When a cap is hit, mark the claim `insufficient_evidence` and move on — do not loop past the cap under any circumstance.
6. **Every payment must be logged as a `PaymentReceipt` with a real transaction hash before the calling task is considered complete.** No payment, no receipt, no marking-done.
7. **No real money, ever, in this build phase.** Base Sepolia + test USDC only. Do not switch to mainnet or use real Stripe charges (test mode only) without the whole team agreeing first.
8. **No Claude/Anthropic API usage anywhere in this project.** LLM calls are Gemini or Grok only, as stated in Section 2.
9. **Work should be divided roughly equally across the 4 modules below.** If your module turns out to be significantly bigger or smaller than the others once you're in it, flag this early rather than quietly grinding through a 3x workload.
10. **Use proper .env/.env.example files and dont hardcode the api in the app**
---

## 5. Module Breakdown (4 people, 4 modules)

Rebalanced from a strict "one agent type per module" split: Module 2 owns the three same-shaped gathering agents (Search/Academic/Safety) since one person maintaining that template consistently is better than splitting near-identical work across people. Module 3 owns payments *and* the Fact-Checker agent, since the Fact-Checker is the one agent that calls payments directly — same person, no handoff friction. The Synthesizer is intentionally unassigned; it's the lightest piece of work in the agent layer and should go to whoever has spare capacity once building is underway.

### Module 1 — Orchestrator, Planning & Shared State
**Owns:** the "brain" and the database layer everything else reads/writes to.

- Supabase schema + migrations for: `sessions`, `tasks`, `evidence`, `claims`, `payments`, `events`, `budgets`, `users`/credits (coordinate the credits table shape with Module 3).
- The event-sourced state reducer described in Section 3 (single writer, applies events in order to derive current task/evidence/claim/budget state).
- The Orchestrator itself: takes a raw user query, calls Gemini to decompose it into a `Task[]` research plan (search/academic/safety at minimum), writes initial tasks to the DB.
- The task executor: a dependency-respecting loop that identifies which tasks are "ready" (all `dependsOn` complete) and dispatches them — in parallel where possible. (See earlier discussion: this can be a simple `while` loop over the task list, no framework needed.)
- Session budget setup: on session start, carve out a budget from the user's credit wallet (coordinate exact mechanism with Module 3) and enforce `maxFactCheckIterations` / `maxDynamicTasks`.
- Expose a clean internal API (functions or route handlers) that Module 2's agents call to: read session state, write task results, request a new dynamically-spawned task (subject to caps).

### Module 2 — Search, Academic & Safety Agents
**Owns:** the three "gathering" agents, which all share one template.

- **Search Agent:** takes a task input, optionally refines the query via Gemini, calls Tavily Search, returns structured findings (claims + `SourceRef[]`) written back via Module 1's API.
- **Academic Agent:** same shape, but targets academic/research sources. This is the **primary paid agent** — when it hits a paywalled source, it calls the x402 client (built in Module 3) to pay and retrieve it. Coordinate the exact function signature for "pay and fetch" with Module 3 early, since you're the first consumer of it.
- **Safety Agent:** same shape, focused on risks/contraindications/side effects. This is the most copy-paste-able of the three (same template, different prompt/sources) — if you're ahead of schedule, this is the first thing to hand off to whoever's behind on another module.
- Every agent follows the same shape: (1) optional LLM reasoning step, (2) tool/API call (free or paid), (3) structured output with `SourceRef`s, written back through Module 1's state API — keep this consistent across all three.
- The **Synthesizer agent** (narrative-writing only, no tool calls — takes verified claims + evidence, produces the report's prose sections via Gemini) is deliberately unassigned above. It's the lowest-effort piece in the whole system, so once the four of you are underway, give it to whoever has the most slack — Module 1's owner is a reasonable default if no one else has capacity.

### Module 3 — Payments Layer, Credit Wallet & Fact-Checker Agent
**Owns:** everything involving money, real or test, plus the one agent that spends it.

- **x402 client wrapper:** a `payAndFetch(url, params, wallet)` function used by Module 2's Academic agent and by your own Fact-Checker agent below. Handles the `402 → sign → retry → 200` flow via the Base Sepolia facilitator (`x402.org/facilitator`), returns data + a `PaymentReceipt`. Built on viem + x402-fetch — see Section 2.
- **Treasury wallet setup:** generate/manage the platform's EVM keypair, document how to fund it from the Base Sepolia ETH faucet (gas) and the Circle testnet USDC faucet (payments). This wallet's private key must be handled via environment variables, never committed to the repo.
- **User credit wallet:** Supabase table for user balances, a Stripe (test mode) checkout + webhook flow that credits the wallet on successful payment, and a `checkAndDebit(userId, amount)` function Module 1 calls before dispatching any task that might cost money.
- **The exchange-rate rule between the two systems:** define one fixed internal price per task type (e.g. "$0.02 credits per academic-agent paid call") that comfortably covers the real testnet cost — document this clearly since Module 1 needs it for budget carve-out and Module 2 needs it to know what a call "costs" before making it.
- **At least one x402-protected resource server** you control (wrapping a real or mock paid data source) so the whole loop is demonstrably real end-to-end, not dependent on finding enough already-x402-native third-party APIs.
- **Fact-Checker Agent** (moved here because it's the one agent tightly coupled to payments — you own both ends of that integration): reads all `Evidence` and `Claim`s from session state, checks whether each claim is actually supported, assigns a **deterministic confidence score** (e.g. `supporting_sources / sources_checked`, weighted by source type — do not let the LLM freely assign a confidence number, compute it in code from countable signals). If confidence is below threshold and the iteration/dynamic-task caps allow it, it may request one more targeted search or one paid verification call using your own `payAndFetch` — otherwise mark `insufficient_evidence` and stop.

### Module 4 — Frontend & Report Compiler
**Owns:** everything the user actually sees.

- Next.js pages: a query input screen, a live session view showing task/agent progress as it happens (poll or subscribe to Supabase changes on the `events` table — this is your "observability" story, make it visible, not just logged internally), and the final report view.
- **Report Compiler:** takes the Synthesizer's narrative sections + the claims/evidence/citations and renders the final structured report (matching the shape described in Section 1: overview, medicinal uses, scientific evidence, risks, recent research, limitations, sources list).
- **Payment proof display:** a visible section (or expandable panel) listing each `PaymentReceipt` used in the session — amount, purpose, and a link to the transaction on the Base Sepolia explorer (`sepolia.basescan.org`). This is what makes the x402 part demonstrable to anyone reviewing the project, not just something happening invisibly on the backend.
- Credit wallet UI: current balance, a top-up flow (Stripe test checkout), and a clear low-balance prompt if a session can't be funded.
- Keep styling functional and clean — do not over-invest here before the pipeline itself works.
- Build all UI with shadcn/ui components already available in the repo (`Card` for report sections and the payment-proof panel, `Badge` for claim status like supported/unsupported, `Progress` or a simple stepper for live task status, `Tabs` for report sections, `Dialog` for the top-up flow, `Alert` for low-balance warnings, `Table` for the payment receipts list, `Skeleton` for loading states). Use `lucide-react` icons throughout (e.g. `CheckCircle2` for verified claims, `AlertTriangle` for unsupported ones, `Wallet` for the credit balance, `ExternalLink` next to explorer links). Do not install new shadcn components one at a time as you go — note what you need and see Section 7.

---

## 6. What "done" looks like for the combined v1+v2 build

A user can submit a research query, watch tasks run (some in parallel, visibly), see at least one real x402 test payment happen with a verifiable transaction hash, see the fact-checker either verify claims cleanly or — within its capped limit — spawn one additional targeted research task and incorporate it, and receive a final report with inline citations and a visible payment-proof section, all without the user ever touching a crypto wallet directly. Their credit balance decreases by an amount that correctly reflects what was actually spent.

If you hit a decision point not covered above, **stop and ask the team rather than guessing** — this applies to every module, every person, every time.

---

## 7. shadcn/ui — one-time component install

shadcn/ui is already initialized in this repo. **Do not run `shadcn init` again, and do not install components individually as you go.** Once, at the start of building Module 4 (or earlier if someone wants to pre-empt it), run this single command to add every component used across the project:

```bash
npx shadcn@latest add button card input badge progress tabs accordion dialog alert skeleton separator scroll-area table sonner avatar
```

If mid-build you find you genuinely need a component not in this list, don't silently `add` it yourself — flag it to whoever owns Module 4 so the list (and this doc) stays the single source of truth for what's installed.

Icons throughout the project come from `lucide-react` (already a standard peer dependency of shadcn) — no separate icon package needed.