import type { ApiAuthProvider } from "../types";

const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const JWT_CACHE_DURATION_MS = 55 * 60 * 1000;

// Circuit breaker for a wedged session (#5513). When /api/auth/token keeps
// failing, a client that mints per request would otherwise fire hundreds of
// requests with no backoff — enough to trip an upstream per-IP rate limit and
// lock the user out of the login endpoint too. After a failure we refuse to
// touch the network again until an exponentially growing cooldown elapses, so
// a broken session degrades to at most a trickle of retries.
const JWT_FAILURE_BASE_BACKOFF_MS = 1000;
const JWT_FAILURE_MAX_BACKOFF_MS = 5 * 60 * 1000;

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

export interface JwtApiAuthProviderOptions {
	/**
	 * Returns the current session/api-key/JWT token to authenticate with.
	 * Called whenever a fresh JWT needs to be minted, so token rotations
	 * (re-login, refresh) are picked up without restarting the host-service.
	 */
	getSessionToken: () => Promise<string>;
	onInvalidateCache?: () => void;
	apiUrl: string;
}

export class JwtApiAuthProvider implements ApiAuthProvider {
	private readonly getSessionToken: () => Promise<string>;
	private readonly onInvalidateCache?: () => void;
	private readonly apiUrl: string;
	private cachedJwt: string | null = null;
	private cachedJwtExpiresAt = 0;
	private inflight: Promise<string> | null = null;
	private failureCount = 0;
	private backoffUntil = 0;
	private lastFailure: Error | null = null;

	constructor(options: JwtApiAuthProviderOptions) {
		this.getSessionToken = options.getSessionToken;
		this.onInvalidateCache = options.onInvalidateCache;
		this.apiUrl = options.apiUrl;
	}

	async getHeaders(): Promise<Record<string, string>> {
		const jwt = await this.getJwt();
		return { Authorization: `Bearer ${jwt}` };
	}

	invalidateCache(): void {
		this.cachedJwt = null;
		this.cachedJwtExpiresAt = 0;
		this.onInvalidateCache?.();
	}

	async getJwt(): Promise<string> {
		if (
			this.cachedJwt &&
			Date.now() < this.cachedJwtExpiresAt - JWT_REFRESH_BUFFER_MS
		) {
			return this.cachedJwt;
		}

		// Circuit breaker: while a recent mint failure's cooldown is still
		// active, reject immediately without touching the network so a wedged
		// session can't storm /api/auth/token (#5513).
		if (Date.now() < this.backoffUntil) {
			throw this.lastFailure ?? new Error("Failed to mint JWT");
		}

		// Coalesce concurrent callers onto a single mint so a burst of
		// requests on a cold cache doesn't fan out N token exchanges.
		if (this.inflight) return this.inflight;
		this.inflight = this.mintJwt().finally(() => {
			this.inflight = null;
		});
		return this.inflight;
	}

	private async mintJwt(): Promise<string> {
		try {
			const jwt = await this.exchangeSessionForJwt();
			this.failureCount = 0;
			this.backoffUntil = 0;
			this.lastFailure = null;
			return jwt;
		} catch (error) {
			this.failureCount += 1;
			const backoff = Math.min(
				JWT_FAILURE_BASE_BACKOFF_MS * 2 ** (this.failureCount - 1),
				JWT_FAILURE_MAX_BACKOFF_MS,
			);
			this.backoffUntil = Date.now() + backoff;
			this.lastFailure =
				error instanceof Error ? error : new Error(String(error));
			throw this.lastFailure;
		}
	}

	private async exchangeSessionForJwt(): Promise<string> {
		const sessionToken = await this.getSessionToken();

		// CLI OAuth code+PKCE login stores the OAuth access token directly,
		// which is already a JWT signed by the same JWKS the relay verifies
		// against and carries `organizationIds` via customAccessTokenClaims.
		// Pass it through — no /api/auth/token exchange needed (and the
		// better-auth jwt plugin endpoint doesn't accept OAuth tokens
		// anyway, only sessions and api keys).
		if (looksLikeJwt(sessionToken)) {
			return sessionToken;
		}

		// better-auth's apiKey plugin reads `sk_live_…` from x-api-key, not
		// Authorization: Bearer; mirror what the CLI's tRPC client does in
		// packages/cli/src/lib/api-client.ts.
		const response = await fetch(`${this.apiUrl}/api/auth/token`, {
			headers: sessionToken.startsWith("sk_live_")
				? { "x-api-key": sessionToken }
				: { Authorization: `Bearer ${sessionToken}` },
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
