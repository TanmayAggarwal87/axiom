import { WalletClient } from "viem";
import { PaymentReceipt } from "../../types/shared";
import { getTreasuryWalletClient, DEFAULT_FACILITATOR_URL } from "./treasury";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";

export type PayAndFetchOptions = RequestInit & {
  sessionId: string;
  agent: string;
  purpose: string;
};

export type PayAndFetchResult<T = unknown> = {
  data: T;
  receipt: PaymentReceipt | null;
  response: Response;
};

/**
 * x402 Client Wrapper: payAndFetch(url, options, wallet)
 * Delegates directly to @x402/fetch wrapFetchWithPayment with x402Client & ExactEvmScheme.
 * Handles 402 -> sign -> retry -> 200 flow according to x402 protocol standards.
 * Decodes real settlement headers from facilitator — NO mock fallbacks or fake hashes.
 */
export async function payAndFetch<T = unknown>(
  url: string,
  options: PayAndFetchOptions,
  wallet?: WalletClient
): Promise<PayAndFetchResult<T>> {
  if (!options || !options.sessionId || !options.agent || !options.purpose) {
    throw new Error("payAndFetch requires explicit options: { sessionId, agent, purpose }.");
  }

  const { sessionId, agent, purpose, ...fetchInit } = options;
  const walletClient = wallet || getTreasuryWalletClient();

  // 1. Initialize x402Client with ExactEvmScheme for EVM chains (eip155:*)
  const account = (walletClient as any).account || walletClient;
  const clientSigner = toClientEvmSigner(account as any);
  const client = new x402Client().register("eip155:*", new ExactEvmScheme(clientSigner as any));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const response = await fetchWithPayment(url, fetchInit);

  if (!response.ok) {
    const errorText = await response.text();
    const payReqHeader = response.headers.get("PAYMENT-REQUIRED") || response.headers.get("payment-required");
    let detail = errorText;
    if (payReqHeader) {
      try {
        const decoded = JSON.parse(Buffer.from(payReqHeader, "base64").toString("utf-8"));
        if (decoded?.error) {
          detail = `${decoded.error} (raw: ${errorText || "{}"})`;
        }
      } catch (_) {}
    }
    throw new Error(`HTTP ${response.status} failed requesting ${url}: ${detail}`);
  }

  // 2. Decode response data
  const data = (await response.json()) as T;

  // 3. Extract and decode standard x402 settlement response header
  const paymentResponseHeader =
    response.headers.get("PAYMENT-RESPONSE") ||
    response.headers.get("payment-response") ||
    response.headers.get("X-PAYMENT-RESPONSE") ||
    response.headers.get("x-payment-response");

  let receipt: PaymentReceipt | null = null;

  if (paymentResponseHeader) {
    try {
      const settlement = decodePaymentResponseHeader(paymentResponseHeader);
      const txHash = settlement?.transaction;

      if (settlement && settlement.success && typeof txHash === "string" && txHash.startsWith("0x")) {
        receipt = {
          id: `rcpt_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`,
          sessionId,
          agent,
          amountUsdc: 0.02,
          network: "eip155:84532",
          txHash,
          facilitator: DEFAULT_FACILITATOR_URL,
          purpose,
          createdAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn(`[payAndFetch] Could not decode PAYMENT-RESPONSE header:`, err);
    }
  }

  return {
    data,
    receipt,
    response,
  };
}
