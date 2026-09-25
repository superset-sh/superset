import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 of `payload` as lowercase hex — what most providers sign with. */
export function hmacHex(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** HMAC-SHA256 of `payload` as base64 — what Hookdeck signs with. */
export function hmacBase64(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

/**
 * Constant-time compare of two base64 digests. Compares decoded bytes, so
 * padding differences do not matter; a length mismatch is a mismatch rather
 * than a throw, as with the hex form.
 */
export function timingSafeBase64(received: string, expected: string): boolean {
	const a = Buffer.from(received.trim(), "base64");
	const b = Buffer.from(expected, "base64");
	return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
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

/**
 * Verify a delivery signed per the Standard Webhooks spec, which Granola and
 * every other Svix-backed sender uses.
 *
 * Three differences from the hex-digest-over-the-body shape above, and all
 * three matter: the signed string is `{id}.{timestamp}.{body}` rather than the
 * body alone, the digest is base64 rather than hex, and the key is the base64
 * payload *after* the `whsec_` prefix rather than the literal string. Signing
 * the id and timestamp is what makes the timestamp check meaningful — an
 * attacker cannot replay a body under a fresh timestamp without the key.
 *
 * The header may carry several space-separated `v1,<sig>` entries during a
 * secret rotation, so any match is a pass.
 */
export function verifyStandardWebhook(params: {
	id: string | null;
	timestamp: string | null;
	signatureHeader: string | null;
	body: string;
	secret: string;
	toleranceMs: number;
}): boolean {
	const { id, timestamp, signatureHeader, body, secret } = params;
	if (!id || !timestamp || !signatureHeader) return false;
	if (!freshTimestamp(timestamp, params.toleranceMs)) return false;

	const key = secret.startsWith("whsec_")
		? Buffer.from(secret.slice("whsec_".length), "base64")
		: Buffer.from(secret, "utf8");
	if (key.length === 0) return false;

	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${body}`, "utf8")
		.digest();

	// Every candidate is compared even after a match, so the work does not
	// depend on which entry matched.
	let matched = false;
	for (const entry of signatureHeader.split(/\s+/)) {
		const [version, value] = entry.split(",", 2);
		if (version !== "v1" || !value) continue;
		const received = Buffer.from(value, "base64");
		if (
			received.length === expected.length &&
			timingSafeEqual(received, expected)
		) {
			matched = true;
		}
	}
	return matched;
}

export function unauthorized(error: string): Response {
	return Response.json({ error }, { status: 401 });
}
