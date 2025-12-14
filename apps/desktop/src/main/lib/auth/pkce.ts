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
 * PKCE state storage
 * Stores code verifier temporarily during OAuth flow
 */
class PkceStore {
	private codeVerifier: string | null = null;
	private createdAt: number | null = null;

	// Code verifier expires after 10 minutes
	private readonly EXPIRY_MS = 10 * 60 * 1000;

	/**
	 * Generate and store a new PKCE pair
	 * Returns the code challenge to send to the authorization server
	 */
	createChallenge(): { codeChallenge: string; codeVerifier: string } {
		this.codeVerifier = generateCodeVerifier();
		this.createdAt = Date.now();

		const codeChallenge = generateCodeChallenge(this.codeVerifier);

		return {
			codeChallenge,
			codeVerifier: this.codeVerifier,
		};
	}

	/**
	 * Retrieve and consume the stored code verifier
	 * Returns null if expired or not found
	 */
	consumeVerifier(): string | null {
		if (!this.codeVerifier || !this.createdAt) {
			return null;
		}

		// Check expiry
		if (Date.now() - this.createdAt > this.EXPIRY_MS) {
			this.clear();
			return null;
		}

		const verifier = this.codeVerifier;
		this.clear();
		return verifier;
	}

	/**
	 * Clear stored PKCE state
	 */
	clear(): void {
		this.codeVerifier = null;
		this.createdAt = null;
	}
}

export const pkceStore = new PkceStore();
