import type { PaymentReceipt } from "@/types/shared";

export interface PaidFetcher {
  payAndFetch<T = any>(
    url: string,
    options: {
      sessionId: string;
      agent: string;
      purpose: string;
    }
  ): Promise<{
    data: T;
    receipt?: PaymentReceipt | null;
    paymentReceiptId?: string | null;
    response?: Response;
  }>;
}
