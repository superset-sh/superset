import { createRemoteJWKSet, jwtVerify } from "jose";

/** The claims the Workers act on. `scope` is set only on tokens the API mints for itself. */
export interface AuthContext {
	sub: string;
	organizationIds: string[];
	scope?: string;
}

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(authUrl: string): ReturnType<typeof createRemoteJWKSet> {
	let jwks = jwksByUrl.get(authUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authUrl));
		jwksByUrl.set(authUrl, jwks);
	}
	return jwks;
}

/**
 * Verify a user JWT the API issued, for a Worker fronting it. Hourly
 * rotation expiries are expected and silent; anything else is logged tersely,
 * never with the decoded payload (it carries plaintext emails).
 */
export async function verifyJWT(
	token: string,
	authUrl: string,
): Promise<AuthContext | null> {
	try {
		const { payload } = await jwtVerify(token, getJWKS(authUrl), {
			issuer: authUrl,
			audience: authUrl,
		});
		const sub = payload.sub;
		const organizationIds = payload.organizationIds as string[] | undefined;
		if (!sub || !organizationIds) return null;
		const scope = typeof payload.scope === "string" ? payload.scope : undefined;
		return { sub, organizationIds, scope };
	} catch (error) {
		const code =
			error instanceof Error && "code" in error
				? (error as { code?: string }).code
				: undefined;
		if (code !== "ERR_JWT_EXPIRED") {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[jwt] verification failed: ${message}`);
		}
		return null;
	}
}
