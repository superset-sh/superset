/**
 * Internal Authentication Utilities
 *
 * HMAC-based authentication for internal API calls between control plane and Modal.
 */

/**
 * Generate an HMAC-signed token for internal API authentication.
 * Token includes timestamp to prevent replay attacks.
 */
export async function generateInternalToken(secret: string): Promise<string> {
	const timestamp = Date.now();
	const payload = `${timestamp}`;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

	const signatureHex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	return `${timestamp}.${signatureHex}`;
}

/**
 * Verify an HMAC-signed token.
 * Returns true if valid and not expired (5 minute window).
 */
export async function verifyInternalToken(
	token: string,
	secret: string,
	maxAgeMs = 5 * 60 * 1000,
): Promise<boolean> {
	const parts = token.split(".");
	if (parts.length !== 2) {
		return false;
	}

	const [timestampStr, signatureHex] = parts;
	const timestamp = parseInt(timestampStr, 10);

	if (isNaN(timestamp)) {
		return false;
	}

	// Check if token is expired
	const now = Date.now();
	if (now - timestamp > maxAgeMs) {
		return false;
	}

	// Verify signature
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	const signatureBytes = new Uint8Array(
		signatureHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || [],
	);

	return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(timestampStr));
}

/**
 * Generate a random token for sandbox authentication.
 */
export function generateSandboxToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Hash a token for storage (one-way).
 */
export async function hashToken(token: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
