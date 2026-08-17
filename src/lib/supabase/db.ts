import { createClient } from "@supabase/supabase-js";
import type { SessionState, SessionEvent, Task, Evidence, Claim, PaymentReceipt, SessionBudget } from "../orchestrator/types";
import { stateReducer } from "../orchestrator/reducer";

// Check environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const useRealSupabase = supabaseUrl !== "" && supabaseKey !== "";

// In-memory fallback database (attached to globalThis for HMR persistence)
type InMemoryDB = {
  users: Record<string, { id: string; email: string; credits: number }>;
  sessions: Record<string, { id: string; user_id: string; created_at: string }>;
  states: Record<string, SessionState>;
};

const globalForDb = globalThis as unknown as {
  inMemoryDb: InMemoryDB | undefined;
};

const inMemoryDb: InMemoryDB = globalForDb.inMemoryDb ?? {
  users: {
    "default-user": { id: "default-user", email: "demo@axiom.org", credits: 10.0 },
  },
  sessions: {},
  states: {},
};

if (process.env.NODE_ENV !== "production") {
  globalForDb.inMemoryDb = inMemoryDb;
}

// Initialize Supabase Client
export const supabase = useRealSupabase ? createClient(supabaseUrl, supabaseKey) : null;

if (!useRealSupabase) {
  console.log("[Supabase DB] Running in mock / in-memory database mode.");
}

/**
 * Ensures user exists. Used for dev and testing setup.
 * Preserves existing user credits if user already exists.
 */
export async function ensureUser(userId: string, email: string, initialCredits: number = 10.0) {
  if (useRealSupabase && supabase) {
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (!existingUser) {
      const { error } = await supabase.from("users").insert({
        id: userId,
        email,
        credits: initialCredits,
      });
      if (error) {
        console.error("[Supabase DB] Error inserting new user:", error);
        throw error;
      }
    }
  } else {
    if (!inMemoryDb.users[userId]) {
      inMemoryDb.users[userId] = { id: userId, email, credits: initialCredits };
    }
  }
}

/**
 * Returns user credits.
 */
export async function getUserCredits(userId: string): Promise<number> {
  if (useRealSupabase && supabase) {
    const { data, error } = await supabase
      .from("users")
      .select("credits")
      .eq("id", userId)
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return 0;
      }
      throw error;
    }
    return Number(data?.credits || 0);
  } else {
    return inMemoryDb.users[userId]?.credits || 0;
  }
}

/**
 * Debits user credits. Coordinate with Module 3.
 */
export async function checkAndDebitCredits(userId: string, amount: number): Promise<boolean> {
  if (useRealSupabase && supabase) {
    // Perform simple atomic transaction via select & update
    const { data: user, error: selectError } = await supabase
      .from("users")
      .select("credits")
      .eq("id", userId)
      .single();

    if (selectError || !user) {
      return false;
    }

    const currentCredits = Number(user.credits);
    if (currentCredits < amount) {
      return false;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ credits: currentCredits - amount })
      .eq("id", userId);

    return !updateError;
  } else {
    const user = inMemoryDb.users[userId];
    if (!user || user.credits < amount) {
      return false;
    }
    user.credits = Number((user.credits - amount).toFixed(4));
    return true;
  }
}

/**
 * Creates a research session and initializes its budget.
 */
export async function createSession(
  sessionId: string,
  userId: string,
  budget: SessionBudget
): Promise<void> {
  const initialEvent: SessionEvent = {
    id: `evt-init-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sessionId,
    type: "budget_capped",
    payload: {
      maxFactCheckIterations: budget.maxFactCheckIterations,
      maxDynamicTasks: budget.maxDynamicTasks,
    },
    createdAt: new Date().toISOString(),
  };

  const initialState: SessionState = {
    sessionId,
    tasks: [],
    evidence: [],
    claims: [],
    budget,
    payments: [],
    events: [initialEvent],
  };

  if (useRealSupabase && supabase) {
    // 1. Create Session
    const { error: sessionErr } = await supabase.from("sessions").insert({
      id: sessionId,
      user_id: userId,
    });
    if (sessionErr) throw sessionErr;

    // 2. Create Budget
    const { error: budgetErr } = await supabase.from("budgets").insert({
      session_id: sessionId,
      total_usdc: budget.totalUsdc,
      spent_usdc: budget.spentUsdc,
      max_fact_check_iterations: budget.maxFactCheckIterations,
      max_dynamic_tasks: budget.maxDynamicTasks,
    });
    if (budgetErr) throw budgetErr;

    // 3. Write Initial Event
    const { error: eventErr } = await supabase.from("events").insert({
      id: initialEvent.id,
      session_id: sessionId,
      type: initialEvent.type,
      payload: initialEvent.payload,
      created_at: initialEvent.createdAt,
    });
    if (eventErr) throw eventErr;
  } else {
    inMemoryDb.sessions[sessionId] = {
      id: sessionId,
      user_id: userId,
      created_at: new Date().toISOString(),
    };
    inMemoryDb.states[sessionId] = initialState;
  }
}

/**
 * Retrieves the full derived session state.
 */
export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  if (useRealSupabase && supabase) {
    // Fetch all related data in parallel
    const [
      { data: session },
      { data: budget },
      { data: tasks },
      { data: evidence },
      { data: claims },
      { data: payments },
      { data: events },
    ] = await Promise.all([
      supabase.from("sessions").select("*").eq("id", sessionId).single(),
      supabase.from("budgets").select("*").eq("session_id", sessionId).single(),
      supabase.from("tasks").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("evidence").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("claims").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("payments").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      supabase.from("events").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
    ]);

    if (!session) {
      return null;
    }

    const state: SessionState = {
      sessionId,
      tasks: (tasks || []).map((t) => ({
        id: t.id,
        sessionId: t.session_id,
        type: t.type,
        input: t.input,
        dependsOn: t.depends_on || [],
        status: t.status,
        createdBy: t.created_by,
        result: t.result,
      })),
      evidence: (evidence || []).map((e) => ({
        id: e.id,
        sessionId: e.session_id,
        claim: e.claim,
        source: e.source,
        agent: e.agent,
        confidence: Number(e.confidence),
      })),
      claims: (claims || []).map((c) => ({
        id: c.id,
        sessionId: c.session_id,
        text: c.text,
        status: c.status,
        evidenceIds: c.evidence_ids || [],
        supportedText: c.supported_text,
      })),
      budget: budget
        ? {
            sessionId: budget.session_id,
            totalUsdc: Number(budget.total_usdc),
            spentUsdc: Number(budget.spent_usdc),
            maxFactCheckIterations: budget.max_fact_check_iterations,
            maxDynamicTasks: budget.max_dynamic_tasks,
          }
        : null,
      payments: (payments || []).map((p) => ({
        id: p.id,
        sessionId: p.session_id,
        agent: p.agent,
        amountUsdc: Number(p.amount_usdc),
        network: p.network,
        txHash: p.tx_hash,
        facilitator: p.facilitator,
        purpose: p.purpose,
        createdAt: p.created_at,
      })),
      events: (events || []).map((ev) => ({
        id: ev.id,
        sessionId: ev.session_id,
        type: ev.type,
        payload: ev.payload,
        createdAt: ev.created_at,
      })),
    };

    return state;
  } else {
    return inMemoryDb.states[sessionId] || null;
  }
}

/**
 * Retrieves the owner userId of a research session.
 */
export async function getSessionUserId(sessionId: string): Promise<string | null> {
  if (useRealSupabase && supabase) {
    const { data } = await supabase.from("sessions").select("user_id").eq("id", sessionId).single();
    return data?.user_id || null;
  } else {
    return inMemoryDb.sessions[sessionId]?.user_id || null;
  }
}

// Global lock object to serialize inserts and prevent race conditions per session
const sessionLocks: Record<string, Promise<any>> = {};

/**
 * Appends a new event to the session event log and applies the reducer
 * to derive and save updated state. Ensures sequential execution.
 */
export async function insertEvent(sessionId: string, event: SessionEvent): Promise<SessionState> {
  // Simple lock to avoid race conditions during concurrent reducer executions
  const currentLock = sessionLocks[sessionId] || Promise.resolve();

  const nextLock = currentLock.then(async () => {
    const currentState = await getSessionState(sessionId);
    if (!currentState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Apply the reducer
    const nextState = stateReducer(currentState, event);

    if (useRealSupabase && supabase) {
      // Execute DB writes
      // 1. Write the Event
      const { error: eventErr } = await supabase.from("events").insert({
        id: event.id,
        session_id: sessionId,
        type: event.type,
        payload: event.payload,
        created_at: event.createdAt,
      });
      if (eventErr) throw eventErr;

      // 2. Synchronize derived tables based on event type
      switch (event.type) {
        case "task_started": {
          const payload = event.payload as { taskId: string };
          await supabase
            .from("tasks")
            .update({ status: "running" })
            .eq("id", payload.taskId);
          break;
        }

        case "task_completed": {
          const payload = event.payload as { taskId: string; result: any };
          const task = nextState.tasks.find((t) => t.id === payload.taskId);
          await supabase
            .from("tasks")
            .update({
              status: "done",
              result: payload.result,
            })
            .eq("id", payload.taskId);

          // Update tasks that transitioned from pending→ready (NEVER overwrite running/done/failed)
          for (const t of nextState.tasks) {
            if (t.status === "ready") {
              await supabase.from("tasks")
                .update({ status: "ready" })
                .eq("id", t.id)
                .eq("status", "pending"); // Guard: only pending→ready promotion
            }
          }

          // If this is factcheck, sync any claims updated
          if (task && task.type === "factcheck" && payload.result?.data?.claims) {
            const claims = payload.result.data.claims as Claim[];
            for (const c of claims) {
              await supabase.from("claims").upsert({
                id: c.id,
                session_id: sessionId,
                text: c.text,
                status: c.status,
                evidence_ids: c.evidenceIds,
                supported_text: c.supportedText,
              });
            }
          }
          break;
        }

        case "task_failed": {
          const payload = event.payload as { taskId: string };
          await supabase
            .from("tasks")
            .update({ status: "failed" })
            .eq("id", payload.taskId);
          break;
        }

        case "payment_made": {
          const receipt = event.payload as PaymentReceipt;
          await supabase.from("payments").upsert({
            id: receipt.id,
            session_id: sessionId,
            agent: receipt.agent,
            amount_usdc: receipt.amountUsdc,
            network: receipt.network,
            tx_hash: receipt.txHash,
            facilitator: receipt.facilitator,
            purpose: receipt.purpose,
            created_at: receipt.createdAt,
          });

          if (nextState.budget) {
            await supabase
              .from("budgets")
              .update({ spent_usdc: nextState.budget.spentUsdc })
              .eq("session_id", sessionId);
          }
          break;
        }

        case "evidence_added": {
          const payload = event.payload as any;
          let evidenceObj: Evidence | null = null;
          let claimObj: Claim | null = null;

          if (payload && typeof payload === "object") {
            if ("evidence" in payload) {
              evidenceObj = payload.evidence as Evidence;
              if (payload.claim) {
                claimObj = payload.claim as Claim;
              }
            } else if ("claim" in payload && !("evidence" in payload)) {
              claimObj = payload as unknown as Claim;
            } else {
              evidenceObj = payload as Evidence;
            }
          }

          if (evidenceObj) {
            await supabase.from("evidence").upsert({
              id: evidenceObj.id,
              session_id: sessionId,
              claim: evidenceObj.claim,
              source: evidenceObj.source,
              agent: evidenceObj.agent,
              confidence: evidenceObj.confidence,
            });
          }

          if (claimObj) {
            await supabase.from("claims").upsert({
              id: claimObj.id,
              session_id: sessionId,
              text: claimObj.text,
              status: claimObj.status,
              evidence_ids: claimObj.evidenceIds,
              supported_text: claimObj.supportedText,
            });
          }
          break;
        }

        case "task_spawned": {
          const task = event.payload as Task;
          const currentDynamicTasks = nextState.tasks.filter((t) => t.createdBy === "factchecker").length;
          const limit = nextState.budget?.maxDynamicTasks ?? 3;
          if (currentDynamicTasks < limit) { // Fixed: was <= (off-by-one)
            await supabase.from("tasks").insert({
              id: task.id,
              session_id: sessionId,
              type: task.type,
              input: task.input,
              depends_on: task.dependsOn,
              status: task.status,
              created_by: task.createdBy,
              result: task.result,
            });

            // Only promote pending→ready, never overwrite running/done/failed
            for (const t of nextState.tasks) {
              if (t.status === "ready") {
                await supabase.from("tasks")
                  .update({ status: "ready" })
                  .eq("id", t.id)
                  .eq("status", "pending"); // Guard: only pending→ready
              }
            }
          }
          break;
        }

        case "budget_capped": {
          const payload = event.payload as { maxFactCheckIterations: number; maxDynamicTasks: number };
          await supabase
            .from("budgets")
            .update({
              max_fact_check_iterations: payload.maxFactCheckIterations,
              max_dynamic_tasks: payload.maxDynamicTasks,
            })
            .eq("session_id", sessionId);
          break;
        }
      }
    } else {
      // In-memory update
      inMemoryDb.states[sessionId] = nextState;

      // Update in-memory tasks list statuses too
      if (event.type === "task_started") {
        const payload = event.payload as { taskId: string };
        const task = nextState.tasks.find((t) => t.id === payload.taskId);
        if (task) task.status = "running";
      } else if (event.type === "task_completed") {
        const payload = event.payload as { taskId: string; result: any };
        const task = nextState.tasks.find((t) => t.id === payload.taskId);
        if (task) {
          task.status = "done";
          task.result = payload.result;
        }
      } else if (event.type === "task_failed") {
        const payload = event.payload as { taskId: string };
        const task = nextState.tasks.find((t) => t.id === payload.taskId);
        if (task) task.status = "failed";
      }
    }

    return nextState;
  });

  sessionLocks[sessionId] = nextLock;
  return nextLock;
}
