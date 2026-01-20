import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "@/env";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const statePayloadSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
	timestamp: z.number(),
});

/**
 * Creates a signed state token for OAuth flows.
 * Format: base64url(JSON payload).signature
 *
 * The signature is an HMAC-SHA256 of the payload, preventing forgery.
 * A timestamp is included to prevent replay attacks (10 minute TTL).
 */
export function createSignedState({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): string {
	const payload = { organizationId, userId, timestamp: Date.now() };
	const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(payloadB64)
		.digest("base64url");
	return `${payloadB64}.${signature}`;
}

/**
 * Verifies and extracts payload from a signed state token.
 * Returns null if invalid, expired, or signature doesn't match.
 */
export function verifySignedState(
	state: string,
): { organizationId: string; userId: string } | null {
	const [payloadB64, providedSig] = state.split(".");
	if (!payloadB64 || !providedSig) {
		console.error("[oauth-state] Invalid state format");
		return null;
	}

	// Verify signature using timing-safe comparison
	const expectedSig = createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(payloadB64)
		.digest("base64url");
	const providedBuf = Buffer.from(providedSig, "base64url");
	const expectedBuf = Buffer.from(expectedSig, "base64url");

	if (
		providedBuf.length !== expectedBuf.length ||
		!timingSafeEqual(providedBuf, expectedBuf)
	) {
		console.error("[oauth-state] Signature verification failed");
		return null;
	}

	// Parse and validate payload
	let payload: unknown;
	try {
		payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
	} catch {
		console.error("[oauth-state] Failed to parse payload");
		return null;
	}

	const parsed = statePayloadSchema.safeParse(payload);
	if (!parsed.success) {
		console.error("[oauth-state] Invalid payload schema");
		return null;
	}

	// Check timestamp (replay protection)
	const age = Date.now() - parsed.data.timestamp;
	if (age < 0 || age > STATE_TTL_MS) {
		console.error("[oauth-state] State expired");
		return null;
	}

	return {
		organizationId: parsed.data.organizationId,
		userId: parsed.data.userId,
	};
}
