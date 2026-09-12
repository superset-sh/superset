/**
 * Prints a fresh signing key for sandbox access tokens.
 *
 *   bun run scripts/sandbox/generate-access-key.ts
 *
 * The private key is `SANDBOX_ACCESS_SIGNING_KEY` on the API; sandboxes are
 * handed the public half at provision. Rotating it invalidates every token
 * in flight (they expire within minutes anyway) and every running sandbox's
 * verifier, so existing sandboxes need recreating afterwards.
 */
import { generateSandboxAccessKeyPair } from "../../packages/shared/src/sandbox-access-token.ts";

const pair = generateSandboxAccessKeyPair();
console.log(`SANDBOX_ACCESS_SIGNING_KEY=${pair.privateKey}`);
console.log(`# public (derived, informational): ${pair.publicKey}`);
