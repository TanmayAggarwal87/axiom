import { NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { getTreasuryAddress, BASE_SEPOLIA_USDC, DEFAULT_FACILITATOR_URL, NETWORK_CAIP2 } from "@/lib/x402/treasury";

export const dynamic = "force-dynamic";

// Initialize x402 Facilitator Client & Resource Server
const facilitatorClient = new HTTPFacilitatorClient({
  url: DEFAULT_FACILITATOR_URL,
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK_CAIP2,
  new ExactEvmScheme()
);

const routeConfig = {
  accepts: [
    {
      scheme: "exact",
      price: "$0.02",
      network: NETWORK_CAIP2,
      asset: BASE_SEPOLIA_USDC,
      payTo: getTreasuryAddress(),
    },
  ],
};

/**
 * Base Handler for Paywalled Academic Resource Endpoint
 */
async function baseHandler(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic") || "Neem medicinal compounds";
  const query = searchParams.get("query") || "";

  // Extract transaction hash provided by x402 facilitator settlement
  const txHash =
    request.headers.get("x-tx-hash") ||
    request.headers.get("x-payment-tx-hash") ||
    request.headers.get("x-payment-response");

  const journalArticle = {
    title: `Peer-Reviewed Study: Comprehensive Bioactive Profile of ${topic}`,
    doi: "10.1016/j.jep.2025.118902",
    authors: ["Dr. A. Sharma", "Dr. M. Patel", "Dr. E. Thorne"],
    journal: "Journal of Ethnopharmacology & Natural Products",
    year: 2025,
    query,
    abstract: `HPLC and spectroscopic analysis of ${topic}. Verified active compounds include Azadirachtin, Nimbin, and Nimbidin. Minimal hepatotoxicity (<500mg/kg).`,
    findings: [
      {
        claim: `${topic} exhibits significant antimicrobial and anti-inflammatory activity.`,
        confidence: 0.94,
        studyType: "In Vivo & Double-Blind Clinical Trial",
      },
      {
        claim: `High concentration (>1000mg/kg) of raw seed oil may cause mild transient hepatic stress.`,
        confidence: 0.88,
        studyType: "Toxicological Safety Profile",
      },
    ],
    verifiedBy: "x402-protected peer-review database",
    paymentProof: {
      network: NETWORK_CAIP2,
      amountUsdc: 0.02,
      txHash: txHash || undefined,
      settledAt: new Date().toISOString(),
    },
  };

  const response = NextResponse.json(journalArticle, { status: 200 });
  if (txHash) {
    response.headers.set("X-Tx-Hash", txHash);
    response.headers.set("X-Payment-Receipt", `rcpt_${txHash.substring(2, 12)}`);
  }
  return response;
}

// Wrap Handler with x402 Protocol Middleware
export const GET = withX402(baseHandler, routeConfig, resourceServer);
export const POST = withX402(baseHandler, routeConfig, resourceServer);
