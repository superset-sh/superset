import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a PKCE code verifier (random 43-128 char URL-safe string).
 */
export function generateCodeVerifier(): string {
	return randomBytes(32).toString("base64url");
}

/**
 * Derive the PKCE code challenge from a verifier using S256 method.
 */
export function generateCodeChallenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generate a random state parameter for CSRF protection.
 */
export function generateState(): string {
	return randomBytes(16).toString("hex");
}
