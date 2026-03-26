import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure random token for host-service authentication.
 * This token is used to authenticate requests from the Electron app to prevent
 * unauthorized access from malicious websites.
 */
export function generateSecureToken(): string {
	return randomBytes(32).toString("hex");
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		result |= a.charCodeAt(i) ^ b.charCodeAt(i)!;
	}

	return result === 0;
}
