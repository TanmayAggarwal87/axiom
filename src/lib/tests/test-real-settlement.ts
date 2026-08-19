import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local" });

import http from "http";
import { NextRequest } from "next/server";
import { payAndFetch } from "../x402/payAndFetch";
import { createPublicClient, http as viemHttp } from "viem";
import { baseSepolia } from "viem/chains";

async function testRealSettlement() {
  // Dynamically import route after dotenv has loaded process.env
  const { GET: x402RouteHandler } = await import("@/app/api/x402-resource/route");

  console.log("=================================================");
  console.log("  🚀 TESTING REAL x402 ON-CHAIN SETTLEMENT      ");
  console.log("=================================================\n");

  const port = 38405;
  const url = `http://localhost:${port}/api/x402-resource`;

  // Start local HTTP server delegating to the actual Next.js /api/x402-resource route handler
  const server = http.createServer(async (req, res) => {
    try {
      const fullUrl = `http://localhost:${port}${req.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      const nextReq = new NextRequest(fullUrl, {
        method: req.method,
        headers,
      });

      const nextRes = await x402RouteHandler(nextReq);

      res.statusCode = nextRes.status;
      nextRes.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      const body = await nextRes.text();
      res.end(body);
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise<void>((resolve) => server.listen(port, () => resolve()));
  console.log(`Local x402 resource server running on port ${port}...`);

  try {
    console.log("Executing payAndFetch with real treasury wallet client...");
    const result = await payAndFetch<{ title: string }>(url, {
      sessionId: "session_real_test_123",
      agent: "AcademicAgent",
      purpose: "Real Base Sepolia x402 settlement test",
    });

    console.log("\n--- RESULT ---");
    console.log("HTTP Status:", result.response.status);
    console.log("Article Title:", result.data?.title);
    console.log("Payment Receipt:", result.receipt);

    if (!result.receipt) {
      throw new Error("FAIL: No PaymentReceipt returned from payAndFetch.");
    }

    const txHash = result.receipt.txHash;
    console.log(`\nTransaction Hash: ${txHash}`);

    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
      throw new Error(`FAIL: Invalid transaction hash format: ${txHash}`);
    }

    console.log("\nVerifying transaction on-chain via Base Sepolia RPC...");
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: viemHttp("https://base-sepolia-rpc.publicnode.com"),
    });

    console.log(`Waiting for transaction confirmation on Base Sepolia for ${txHash}...`);
    const onChainReceipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 30000,
    });

    console.log(`\n ✅ SUCCESS: Real Transaction confirmed on Base Sepolia!`);
    console.log(` Block Number: ${onChainReceipt.blockNumber}`);
    console.log(` Status: ${onChainReceipt.status}`);
    console.log(` Explorer URL: https://sepolia.basescan.org/tx/${txHash}`);

  } catch (err: any) {
    console.error("\n ❌ TEST ERROR:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

testRealSettlement();
