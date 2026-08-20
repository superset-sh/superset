import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 of `payload` as lowercase hex — what most providers sign with. */
export function hmacHex(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Constant-time compare of two hex digests. A length mismatch is a mismatch,
 * never a throw, so a malformed header cannot 500 the route.
 */
export function timingSafeHex(received: string, expected: string): boolean {
	const a = Buffer.from(received.trim().toLowerCase(), "hex");
	const b = Buffer.from(expected, "hex");
	return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * True when a sender-supplied timestamp is within `toleranceMs` of our clock,
 * in either direction. Accepts unix seconds or milliseconds; a missing or
 * unparseable value is stale.
 */
export function freshTimestamp(
	value: string | number | null | undefined,
	toleranceMs: number,
): boolean {
	if (value === null || value === undefined) return false;
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return false;
	const ms = n < 1e12 ? n * 1000 : n;
	return Math.abs(Date.now() - ms) <= toleranceMs;
}

export function unauthorized(error: string): Response {
	return Response.json({ error }, { status: 401 });
}
