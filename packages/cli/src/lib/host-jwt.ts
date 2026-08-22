import { getApiUrl } from "./config";

const JWT_CACHE_DURATION_MS = 55 * 60 * 1000;
/** Hard cap on a single token-exchange attempt so a stalled control plane
 * can't hang a CLI command that targets a remote host. */
const TOKEN_FETCH_TIMEOUT_MS = 10 * 1000;

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

/**
 * In-process cache of minted JWTs, keyed by the credential that produced them.
 * A CLI invocation normally uses a single credential, but keying by bearer is
 * both more correct and safer than a single global slot (two API keys in one
 * process must not share a minted JWT).
 */
const jwtCache = new Map<string, { jwt: string; expiresAt: number }>();

/**
 * Mint a JWKS-signed JWT that the relay will accept for the `--host <remote>`
 * path, given the CLI's raw credential.
 *
 * The relay authenticates host-service traffic only by verifying a JWT against
 * its JWKS. An `sk_live_…` API key is not a JWT, so sending it raw in the
 * `Authorization` header (as every call site of `resolveHostTarget` does) makes
 * the relay return `UNAUTHORIZED` — which the CLI's generic handler then
 * renders as the misleading "Session expired" (#6315).
 *
 * This mirrors the exchange already performed by
 * `packages/host-service/.../JwtAuthProvider.getJwt()` and `packages/sdk/src/client.ts`:
 *   - tokens that already look like JWTs (CLI OAuth access tokens are
 *     JWKS-signed) pass straight through, no exchange needed;
 *   - `sk_live_` / `sk_test_` API keys are exchanged for a JWT via
 *     `GET {api}/api/auth/token` with the key in the `x-api-key` header
 *     (better-auth's apiKey plugin reads that header, not `Authorization`).
 * The minted JWT is cached in-process for ~55 minutes.
 */
export async function getHostJwt(bearer: string): Promise<string> {
	if (looksLikeJwt(bearer)) return bearer;
	const cached = jwtCache.get(bearer);
	if (cached && Date.now() < cached.expiresAt) {
		return cached.jwt;
	}
	const response = await fetch(`${getApiUrl()}/api/auth/token`, {
		headers: {
			"x-api-key": bearer,
		},
		signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(
			`Failed to authenticate API key with the control plane (${response.status})`,
		);
	}
	const data = (await response.json()) as { token?: unknown };
	// A 2xx without a usable token must not be cached — sending `Bearer
	// undefined` (or a whitespace-only string) later would surface as a
	// misleading relay auth failure. A malformed 2xx must not poison the cache
	// for the full 55 minutes, so keep the retry behaviour of other failures.
	if (typeof data?.token !== "string" || data.token.trim().length === 0) {
		throw new Error(
			"Control plane returned a token response without a token value",
		);
	}
	jwtCache.set(bearer, {
		jwt: data.token,
		expiresAt: Date.now() + JWT_CACHE_DURATION_MS,
	});
	return data.token;
}
