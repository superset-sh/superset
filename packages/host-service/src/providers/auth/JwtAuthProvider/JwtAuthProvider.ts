import type { ApiAuthProvider } from "../types";

const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const JWT_CACHE_DURATION_MS = 55 * 60 * 1000;

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

export class JwtApiAuthProvider implements ApiAuthProvider {
	private readonly sessionToken: string;
	private readonly apiUrl: string;
	private cachedJwt: string | null = null;
	private cachedJwtExpiresAt = 0;

	constructor(sessionToken: string, apiUrl: string) {
		this.sessionToken = sessionToken;
		this.apiUrl = apiUrl;
	}

	async getHeaders(): Promise<Record<string, string>> {
		const jwt = await this.getJwt();
		return { Authorization: `Bearer ${jwt}` };
	}

	async getJwt(): Promise<string> {
		// CLI OAuth code+PKCE login stores the OAuth access token directly,
		// which is already a JWT signed by the same JWKS the relay verifies
		// against and carries `organizationIds` via customAccessTokenClaims.
		// Pass it through — no /api/auth/token exchange needed (and the
		// better-auth jwt plugin endpoint doesn't accept OAuth tokens
		// anyway, only sessions and api keys).
		if (looksLikeJwt(this.sessionToken)) {
			return this.sessionToken;
		}

		if (
			this.cachedJwt &&
			Date.now() < this.cachedJwtExpiresAt - JWT_REFRESH_BUFFER_MS
		) {
			return this.cachedJwt;
		}

		// better-auth's apiKey plugin reads `sk_live_…` from x-api-key, not
		// Authorization: Bearer; mirror what the CLI's tRPC client does in
		// packages/cli/src/lib/api-client.ts.
		const response = await fetch(`${this.apiUrl}/api/auth/token`, {
			headers: this.sessionToken.startsWith("sk_live_")
				? { "x-api-key": this.sessionToken }
				: { Authorization: `Bearer ${this.sessionToken}` },
		});
		if (!response.ok) {
			throw new Error(`Failed to mint JWT: ${response.status}`);
		}
		const data = (await response.json()) as { token: string };
		this.cachedJwt = data.token;
		this.cachedJwtExpiresAt = Date.now() + JWT_CACHE_DURATION_MS;
		return data.token;
	}
}
