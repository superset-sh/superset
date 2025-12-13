import crypto from "node:crypto";

/**
 * Generate a cryptographically random code verifier for PKCE.
 * Must be between 43-128 characters, using unreserved URI characters.
 */
export function generateCodeVerifier(): string {
	const buffer = crypto.randomBytes(32);
	return buffer
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

/**
 * Generate the code challenge from a code verifier using SHA-256.
 */
export function generateCodeChallenge(verifier: string): string {
	const hash = crypto.createHash("sha256").update(verifier).digest();
	return hash
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

/**
 * Generate a random state parameter to prevent CSRF attacks.
 */
export function generateState(): string {
	return crypto.randomBytes(16).toString("hex");
}

export interface PKCEPair {
	verifier: string;
	challenge: string;
	state: string;
}

/**
 * Generate a complete PKCE pair with state for OAuth flow.
 */
export function generatePKCE(): PKCEPair {
	const verifier = generateCodeVerifier();
	const challenge = generateCodeChallenge(verifier);
	const state = generateState();
	return { verifier, challenge, state };
}
