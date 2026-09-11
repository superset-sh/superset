import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthContext {
	sub: string;
	organizationIds: string[];
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(authUrl: string): ReturnType<typeof createRemoteJWKSet> {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authUrl));
	}
	return jwks;
}

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
		return { sub, organizationIds };
	} catch (error) {
		// Hourly rotation expiries are expected; everything else is logged
		// tersely, never with the decoded payload.
		const code =
			error instanceof Error && "code" in error
				? (error as { code?: string }).code
				: undefined;
		if (code !== "ERR_JWT_EXPIRED") {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[realtime] JWT verification failed: ${message}`);
		}
		return null;
	}
}
