import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("--- Copy these into your .env ---");
console.log("TREASURY_PRIVATE_KEY=" + privateKey);
console.log("");
console.log("--- Fund this address from the faucets ---");
console.log("Address:", account.address);
console.log("");
console.log("Private key length check:", privateKey.length, "(should be exactly 66)");