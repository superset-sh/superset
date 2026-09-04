import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "@/env";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const basePayloadSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
	timestamp: z.number(),
});

/**
 * The state a plugin OAuth flow carries. Inputs ride along so the callback can
 * re-resolve `${inputs.site}` against a per-tenant token_url; they are
 * non-secret by the time they get here, because the connect route refuses an
 * oauth2 method that declares a secret input.
 */
export const pluginStateSchema = z.object({
	userId: z.string().min(1),
	pluginName: z.string().min(1),
	authMethod: z.string().min(1).default("oauth2"),
	inputs: z.record(z.string(), z.string()).default({}),
	timestamp: z.number(),
});

export type PluginState = z.infer<typeof pluginStateSchema>;

function sign(body: string): string {
	return createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(body)
		.digest("base64url");
}

/**
 * Creates a signed state token for OAuth flows.
 * Format: base64url(JSON payload).signature
 *
 * The signature is an HMAC-SHA256 of the payload, preventing forgery.
 * A timestamp is included to prevent replay attacks (10 minute TTL).
 */
export function createSignedState<T extends Record<string, unknown>>(
	payload: T,
): string {
	const payloadB64 = Buffer.from(
		JSON.stringify({ ...payload, timestamp: Date.now() }),
	).toString("base64url");
	return `${payloadB64}.${sign(payloadB64)}`;
}

/** The payload a state token carries, or null if forged, malformed, or stale. */
function readSignedState(state: string): unknown {
	const [payloadB64, providedSig] = state.split(".");
	if (!payloadB64 || !providedSig) {
		console.error("[oauth-state] Invalid state format");
		return null;
	}

	// Verify signature using timing-safe comparison
	const expectedSig = sign(payloadB64);
	const providedBuf = Buffer.from(providedSig, "base64url");
	const expectedBuf = Buffer.from(expectedSig, "base64url");

	if (
		providedBuf.length !== expectedBuf.length ||
		!timingSafeEqual(providedBuf, expectedBuf)
	) {
		console.error("[oauth-state] Signature verification failed");
		return null;
	}

	try {
		return JSON.parse(Buffer.from(payloadB64, "base64url").toString());
	} catch {
		console.error("[oauth-state] Failed to parse payload");
		return null;
	}
}

function fresh(timestamp: unknown): boolean {
	if (typeof timestamp !== "number") return false;
	const age = Date.now() - timestamp;
	if (age < 0 || age > STATE_TTL_MS) {
		console.error("[oauth-state] State expired");
		return false;
	}
	return true;
}

/**
 * Verifies and extracts payload from a signed state token.
 * Returns null if invalid, expired, or signature doesn't match.
 *
 * Pass a schema to read a flow that carries more than the default
 * `{ organizationId, userId }` — the plugin flows use `pluginStateSchema`.
 */
export function verifySignedState(
	state: string,
): { organizationId: string; userId: string } | null;
export function verifySignedState<S extends z.ZodType<{ timestamp: number }>>(
	state: string,
	schema: S,
): z.infer<S> | null;
export function verifySignedState(
	state: string,
	schema?: z.ZodType<{ timestamp: number }>,
): unknown {
	const payload = readSignedState(state);
	if (payload === null) return null;

	const parsed = (schema ?? basePayloadSchema).safeParse(payload);
	if (!parsed.success) {
		console.error("[oauth-state] Invalid payload schema");
		return null;
	}
	if (!fresh((parsed.data as { timestamp: number }).timestamp)) return null;

	if (schema) return parsed.data;
	const base = parsed.data as z.infer<typeof basePayloadSchema>;
	return { organizationId: base.organizationId, userId: base.userId };
}
