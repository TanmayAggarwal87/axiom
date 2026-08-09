import { createWalletClient, createPublicClient, http, formatUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Base Sepolia USDC contract address — verified against sepolia.basescan.org directly
// (Source Code Verified Exact Match, proxy: FiatTokenProxy) and Circle's developer docs.
// Do not change this without re-verifying on sepolia.basescan.org/token/<address> yourself.
export const BASE_SEPOLIA_USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
export const NETWORK_CAIP2 = "eip155:84532" as const;

export const DEFAULT_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

// Minimal ERC20 ABI for USDC balance check
export const ERC20_MINIMAL_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/**
 * Resolves the platform treasury private key from environment variables.
 * Throws an error if unconfigured or malformed — NO hardcoded key fallbacks allowed.
 */
export function getTreasuryPrivateKey(): `0x${string}` {
  const pk = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!pk || !pk.startsWith("0x") || pk.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error(
      `Configuration Error: TREASURY_PRIVATE_KEY is missing or invalid. Expected exactly 66 characters ` +
        `(0x + 64 hex chars), got ${pk ? pk.length : 0}${pk ? ` starting with "${pk.slice(0, 6)}..."` : ""}.`
    );
  }
  return pk as `0x${string}`;
}

export function getTreasuryAccount() {
  const privateKey = getTreasuryPrivateKey();
  return privateKeyToAccount(privateKey);
}

export function getTreasuryPublicClient() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

export function getTreasuryWalletClient() {
  const account = getTreasuryAccount();
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

export function getTreasuryAddress(): `0x${string}` {
  return getTreasuryAccount().address;
}

/**
 * Fetches native ETH balance. Throws on RPC failure — no fabricated fallback values.
 */
export async function getEthBalance(address?: `0x${string}`): Promise<number> {
  const targetAddress = address || getTreasuryAddress();
  const publicClient = getTreasuryPublicClient();
  try {
    const balanceWei = await publicClient.getBalance({ address: targetAddress });
    return parseFloat(formatUnits(balanceWei, 18));
  } catch (err) {
    throw new Error(`Failed to fetch native ETH balance for ${targetAddress}: ${(err as Error).message}`);
  }
}

/**
 * Fetches USDC balance. Throws on RPC failure — no fabricated fallback values.
 */
export async function getUsdcBalance(address?: `0x${string}`): Promise<number> {
  const targetAddress = address || getTreasuryAddress();
  const publicClient = getTreasuryPublicClient();
  try {
    const rawBalance = (await publicClient.readContract({
      address: BASE_SEPOLIA_USDC,
      abi: ERC20_MINIMAL_ABI,
      functionName: "balanceOf",
      args: [targetAddress],
    })) as bigint;
    return parseFloat(formatUnits(rawBalance, 6));
  } catch (err) {
    throw new Error(`Failed to fetch USDC balance for ${targetAddress}: ${(err as Error).message}`);
  }
}