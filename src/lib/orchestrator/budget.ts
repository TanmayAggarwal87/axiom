import { createSession, checkAndDebitCredits, getUserCredits } from "../supabase/db";
import type { SessionBudget } from "./types";

// Default settings
export const DEFAULT_BUDGET_USDC = 0.50; // $0.50 USDC initial budget
export const MAX_FACT_CHECK_ITERATIONS = 2;
export const MAX_DYNAMIC_TASKS = 3;

/**
 * Initializes a session's budget by checking the user's credits,
 * debitting the required amount, and storing the budget in DB.
 */
export async function initializeSessionBudget(
  sessionId: string,
  userId: string,
  customTotalUsdc?: number
): Promise<SessionBudget> {
  const totalUsdc = customTotalUsdc ?? DEFAULT_BUDGET_USDC;

  // Coordinate credits debit: e.g. 1 USDC = 1 Credit
  const creditCost = totalUsdc;

  const userCredits = await getUserCredits(userId);
  if (userCredits < creditCost) {
    throw new Error(`Insufficient credits. Required: ${creditCost}, Available: ${userCredits}`);
  }

  // Debit user wallet
  const success = await checkAndDebitCredits(userId, creditCost);
  if (!success) {
    throw new Error("Failed to debit user credits.");
  }

  const budget: SessionBudget = {
    sessionId,
    totalUsdc,
    spentUsdc: 0.0,
    maxFactCheckIterations: MAX_FACT_CHECK_ITERATIONS,
    maxDynamicTasks: MAX_DYNAMIC_TASKS,
  };

  await createSession(sessionId, userId, budget);

  return budget;
}
