import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE (Proof Key for Code Exchange) utilities
 * Provides security for OAuth flows by preventing authorization code interception attacks
 */

/**
 * Generate a cryptographically random code verifier
 * Must be 43-128 characters, using unreserved URI characters
 */
export function generateCodeVerifier(): string {
	// 32 bytes = 43 characters when base64url encoded
	return randomBytes(32).toString("base64url");
}

/**
 * Generate code challenge from code verifier using SHA256
 * This is the S256 method as recommended by RFC 7636
 */
export function generateCodeChallenge(codeVerifier: string): string {
	const hash = createHash("sha256").update(codeVerifier).digest();
	return hash.toString("base64url");
}

/**
 * Generate a random state value for CSRF protection
 */
export function generateState(): string {
	return randomBytes(16).toString("base64url");
}

interface PkceData {
	codeVerifier: string;
	state: string;
	createdAt: number;
}

/**
 * PKCE + state storage
 * Stores code verifier and state temporarily during OAuth flow
 */
class PkceStore {
	private data: PkceData | null = null;

	// Expires after 10 minutes
	private readonly EXPIRY_MS = 10 * 60 * 1000;

	/**
	 * Generate and store a new PKCE pair + state
	 * Returns the code challenge and state to send to the authorization server
	 */
	createChallenge(): { codeChallenge: string; state: string } {
		const codeVerifier = generateCodeVerifier();
		const state = generateState();

		this.data = {
			codeVerifier,
			state,
			createdAt: Date.now(),
		};

		return {
			codeChallenge: generateCodeChallenge(codeVerifier),
			state,
		};
	}

	/**
	 * Retrieve and consume the stored verifier if state matches
	 * Returns null if expired, not found, or state mismatch
	 */
	consumeVerifier(state: string): string | null {
		if (!this.data) {
			return null;
		}

		// Check expiry
		if (Date.now() - this.data.createdAt > this.EXPIRY_MS) {
			this.clear();
			return null;
		}

		// Verify state matches (CSRF protection)
		if (this.data.state !== state) {
			console.warn("[auth] State mismatch - possible CSRF attack");
			this.clear();
			return null;
		}

		const verifier = this.data.codeVerifier;
		this.clear();
		return verifier;
	}

	/**
	 * Clear stored PKCE state
	 */
	clear(): void {
		this.data = null;
	}
}

export const pkceStore = new PkceStore();
