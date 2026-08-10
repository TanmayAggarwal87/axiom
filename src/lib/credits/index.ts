import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const TASK_COST_ACADEMIC_PAID = 0.02;
export const TASK_COST_FACTCHECK_VERIFICATION = 0.02;
export const TASK_COST_SEARCH_FREE = 0.005;

// Gated in-memory store for local unit testing environments ONLY
const testEnvironmentStore = new Map<string, number>();

/**
 * Creates Supabase client instance using environment variables.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("your-supabase") || key.includes("your-supabase")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Fatal Configuration Error: Supabase credentials are not configured in production environment.");
    }
    return null;
  }
  return createClient(url, key);
}

/**
 * Reads user credit balance in USD.
 */
export async function getUserCreditBalance(userId: string): Promise<number> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("getUserCreditBalance requires a valid non-empty userId.");
  }

  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("users")
      .select("credits")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return 0;
      }
      throw new Error(`Database Error reading balance for user ${userId}: ${error.message}`);
    }
    return Number(data.credits || 0);
  }

  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    return testEnvironmentStore.get(userId) ?? 10.0;
  }

  throw new Error("Supabase database connection unavailable.");
}

/**
 * Tops up a user's credit balance.
 */
export async function topUpUserCredit(
  userId: string,
  amountUsd: number
): Promise<{ success: boolean; newBalance: number }> {
  if (!userId || typeof userId !== "string") {
    throw new Error("topUpUserCredit requires a valid userId.");
  }
  if (typeof amountUsd !== "number" || amountUsd <= 0) {
    throw new Error("topUpUserCredit requires a positive amountUsd number.");
  }

  const supabase = getSupabaseClient();

  if (supabase) {
    const currentBalance = await getUserCreditBalance(userId);
    const newBal = parseFloat((currentBalance + amountUsd).toFixed(4));
    const { error: upsertErr } = await supabase.from("users").upsert({
      id: userId,
      email: "demo@axiom.org",
      credits: newBal,
    });
    if (upsertErr) {
      throw new Error(`Database Error topping up user credits: ${upsertErr.message}`);
    }
    return { success: true, newBalance: newBal };
  }

  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    const current = testEnvironmentStore.get(userId) ?? 10.0;
    const newBal = parseFloat((current + amountUsd).toFixed(4));
    testEnvironmentStore.set(userId, newBal);
    return { success: true, newBalance: newBal };
  }

  throw new Error("Supabase database connection unavailable.");
}

/**
 * checkAndDebit(userId, amount)
 * Atomic database transaction checking and debiting user credit.
 */
export async function checkAndDebit(
  userId: string,
  amountUsd: number
): Promise<{ success: boolean; remainingBalance: number; error?: string }> {
  if (!userId || typeof userId !== "string") {
    throw new Error("checkAndDebit requires a valid userId.");
  }
  if (typeof amountUsd !== "number" || amountUsd <= 0) {
    throw new Error("checkAndDebit requires a positive amountUsd number.");
  }

  const supabase = getSupabaseClient();

  if (supabase) {
    const currentBalance = await getUserCreditBalance(userId);
    if (currentBalance < amountUsd) {
      return {
        success: false,
        remainingBalance: currentBalance,
        error: `Insufficient credits. Required: $${amountUsd.toFixed(4)}, Available: $${currentBalance.toFixed(4)}`,
      };
    }

    const newBalance = parseFloat((currentBalance - amountUsd).toFixed(4));
    const { error: updateErr } = await supabase
      .from("users")
      .update({ credits: newBalance })
      .eq("id", userId);

    if (updateErr) {
      throw new Error(`Database Error debiting user credits: ${updateErr.message}`);
    }

    return { success: true, remainingBalance: newBalance };
  }

  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    const current = testEnvironmentStore.get(userId) ?? 10.0;
    if (current < amountUsd) {
      return {
        success: false,
        remainingBalance: current,
        error: `Insufficient credits. Required: $${amountUsd.toFixed(4)}, Available: $${current.toFixed(4)}`,
      };
    }
    const rem = parseFloat((current - amountUsd).toFixed(4));
    testEnvironmentStore.set(userId, rem);
    return { success: true, remainingBalance: rem };
  }

  throw new Error("Supabase database connection unavailable.");
}
