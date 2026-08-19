import { SupabaseClient } from "@supabase/supabase-js";
import { supabase, useRealSupabase, inMemoryDb, ensureUser, getUserCredits } from "../supabase/db";

export const TASK_COST_ACADEMIC_PAID = 0.02;
export const TASK_COST_FACTCHECK_VERIFICATION = 0.02;
export const TASK_COST_SEARCH_FREE = 0.005;

/**
 * Creates Supabase client instance using environment variables.
 * Returns null if schema checks failed and we fell back to In-Memory mode.
 */
export function getSupabaseClient(): SupabaseClient | null {
  return useRealSupabase ? supabase : null;
}

/**
 * Reads user credit balance in USD.
 */
export async function getUserCreditBalance(userId: string): Promise<number> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("getUserCreditBalance requires a valid non-empty userId.");
  }
  await ensureUser(userId, `${userId}@user.axiom`, 10.0);
  return await getUserCredits(userId);
}

/**
 * Tops up a user's credit balance.
 */
export async function topUpUserCredit(
  userId: string,
  amountUsd: number
): Promise<{ success: boolean; newBalance: number }> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("topUpUserCredit requires a valid userId.");
  }
  if (typeof amountUsd !== "number" || amountUsd <= 0) {
    throw new Error("topUpUserCredit requires a positive amountUsd number.");
  }

  const email = `${userId}@user.axiom`;
  await ensureUser(userId, email, 10.0);
  const currentBalance = await getUserCreditBalance(userId);
  const newBal = parseFloat((currentBalance + amountUsd).toFixed(4));

  if (useRealSupabase && supabase) {
    const { error: upsertErr } = await supabase.from("users").upsert({
      id: userId,
      email,
      credits: newBal,
    });
    if (upsertErr) {
      throw new Error(`Database Error topping up user credits: ${upsertErr.message}`);
    }
  } else {
    if (inMemoryDb.users[userId]) {
      inMemoryDb.users[userId].credits = newBal;
    } else {
      inMemoryDb.users[userId] = { id: userId, email, credits: newBal };
    }
  }

  return { success: true, newBalance: newBal };
}

/**
 * checkAndDebit(userId, amount)
 * Atomic database transaction checking and debiting user credit.
 */
export async function checkAndDebit(
  userId: string,
  amountUsd: number
): Promise<{ success: boolean; remainingBalance: number; error?: string }> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("checkAndDebit requires a valid userId.");
  }
  if (typeof amountUsd !== "number" || amountUsd <= 0) {
    throw new Error("checkAndDebit requires a positive amountUsd number.");
  }

  const email = `${userId}@user.axiom`;
  await ensureUser(userId, email, 10.0);
  const currentBalance = await getUserCreditBalance(userId);
  if (currentBalance < amountUsd) {
    return {
      success: false,
      remainingBalance: currentBalance,
      error: `Insufficient credits. Required: $${amountUsd.toFixed(4)}, Available: $${currentBalance.toFixed(4)}`,
    };
  }

  const newBalance = parseFloat((currentBalance - amountUsd).toFixed(4));

  if (useRealSupabase && supabase) {
    const { error: updateErr } = await supabase
      .from("users")
      .update({ credits: newBalance })
      .eq("id", userId);

    if (updateErr) {
      throw new Error(`Database Error debiting user credits: ${updateErr.message}`);
    }
  } else {
    if (inMemoryDb.users[userId]) {
      inMemoryDb.users[userId].credits = newBalance;
    } else {
      inMemoryDb.users[userId] = { id: userId, email, credits: newBalance };
    }
  }

  return { success: true, remainingBalance: newBalance };
}
