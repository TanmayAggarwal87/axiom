/**
 * Module 3 Integration Boundary for x402 Paid Resources.
 * 
 * Module 3 implements the x402 payment client wrapping fetch to handle 402 -> sign -> retry -> 200 flow.
 * Academic Agent uses this interface when fetching a paid/paywalled academic resource.
 */
export interface PaidFetcher {
  payAndFetch(
    url: string,
    options: {
      sessionId: string;
      agent: string;
      purpose: string;
    }
  ): Promise<{
    data: unknown;
    paymentReceiptId: string;
  }>;
}
