import type { PaidFetcher } from "../adapters/paid-fetcher";

/**
 * Mock implementation of PaidFetcher for local testing without Module 3.
 * Clearly marked as dev-only mock; does NOT produce fake transaction hashes.
 */
export class MockPaidFetcher implements PaidFetcher {
  private mockReceiptCounter = 1;

  async payAndFetch<T = any>(
    url: string,
    options: { sessionId: string; agent: string; purpose: string }
  ): Promise<{ data: T; paymentReceiptId: string }> {
    const mockReceiptId = `dev_mock_receipt_${Date.now()}_${this.mockReceiptCounter++}`;

    console.log(
      `[MockPaidFetcher] [DEV ONLY] Simulating x402 payment for URL: ${url} (Agent: ${options.agent}, Session: ${options.sessionId})`
    );

    return {
      paymentReceiptId: mockReceiptId,
      data: {
        title: "Paywalled Scientific Journal Monograph [DEV MOCK]",
        url,
        abstract:
          "High-resolution spectroscopic data detailing pharmacological target engagement and receptor kinetic profiles under controlled trial conditions.",
        fullText:
          "Detailed experimental methodology and full clinical dataset retrieved via mock paid access channel.",
        doi: "10.1016/j.jep.2023.116543",
        isPaidContent: true,
      } as unknown as T,
    };
  }
}
