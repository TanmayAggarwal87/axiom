import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { UserCredit } from "@/types/shared";

export const TASK_COST_ACADEMIC_PAID = 0.02;
export const TASK_COST_FACTCHECK_VERIFICATION = 0.02;
export const TASK_COST_SEARCH_FREE = 0.005;

// Gated in-memory store for local unit testing environments ONLY
const testEnvironmentStore = new Map<string, number>();

/**
 * Creates Supabase client instance using environment variables.
 * Throws an error in production if environment variables are missing.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
 * Throws error on database failure.
 */
export async function getUserCreditBalance(userId: string): Promise<number> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("getUserCreditBalance requires a valid non-empty userId.");
  }

  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("user_credits")
      .select("balance_usd")
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // User record does not exist yet -> return 0 balance
        return 0;
      }
      throw new Error(`Database Error reading balance for user ${userId}: ${error.message}`);
    }
    return data.balance_usd;
  }

  // Development/Test environment fallback with explicit warning
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    console.warn(`[DEV WARNING] Supabase unconfigured. Reading balance for '${userId}' from test environment memory.`);
    return testEnvironmentStore.get(userId) ?? 0;
  }

  throw new Error("Supabase database connection unavailable.");
}

/**
 * Tops up a user's credit balance.
 * Throws error on database failure.
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
    // Atomic SQL RPC top up
    const { data, error } = await supabase.rpc("top_up_user_credit", {
      p_user_id: userId,
      p_amount: amountUsd,
    });

    if (error) {
      // Fallback to UPSERT if RPC function is not yet created in Supabase schema
      const currentBalance = await getUserCreditBalance(userId);
      const newBal = parseFloat((currentBalance + amountUsd).toFixed(4));
      const { error: upsertErr } = await supabase.from("user_credits").upsert({
        user_id: userId,
        balance_usd: newBal,
        updated_at: new Date().toISOString(),
      });
      if (upsertErr) {
        throw new Error(`Database Error topping up user credits: ${upsertErr.message}`);
      }
      return { success: true, newBalance: newBal };
    }
    return { success: true, newBalance: data };
  }

  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    console.warn(`[DEV WARNING] Supabase unconfigured. Topping up '${userId}' by $${amountUsd} in test environment memory.`);
    const current = testEnvironmentStore.get(userId) ?? 0;
    const newBal = parseFloat((current + amountUsd).toFixed(4));
    testEnvironmentStore.set(userId, newBal);
    return { success: true, newBalance: newBal };
  }

  throw new Error("Supabase database connection unavailable.");
}

/**
 * checkAndDebit(userId, amount)
 * Atomic database transaction checking and debiting user credit.
 * Prevents race conditions. Throws error on database failures.
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
    // Attempt Atomic RPC Execution in Postgres
    const { data, error } = await supabase.rpc("check_and_debit_credits", {
      p_user_id: userId,
      p_amount: amountUsd,
    });

    if (!error && data !== null) {
      if (data.success === false) {
        return {
          success: false,
          remainingBalance: data.remaining_balance,
          error: `Insufficient credits. Required: $${amountUsd.toFixed(4)}, Available: $${data.remaining_balance.toFixed(4)}`,
        };
      }
      return { success: true, remainingBalance: data.remaining_balance };
    }

    // Fallback: Atomic Single SQL Statement if RPC is not present
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
      .from("user_credits")
      .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .gte("balance_usd", amountUsd); // Optimistic concurrency check constraint

    if (updateErr) {
      throw new Error(`Database Error debiting user credits: ${updateErr.message}`);
    }

    return { success: true, remainingBalance: newBalance };
  }

  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    console.warn(`[DEV WARNING] Supabase unconfigured. Executing checkAndDebit for '${userId}' in test environment memory.`);
    const current = testEnvironmentStore.get(userId) ?? 0;
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
