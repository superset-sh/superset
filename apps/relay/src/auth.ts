import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthContext {
	sub: string;
	organizationIds: string[];
	/** Set only on tokens the API mints for itself; see access.ts. */
	scope?: string;
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

		if (!sub || !organizationIds) {
			return null;
		}

		const scope = typeof payload.scope === "string" ? payload.scope : undefined;
		return { sub, organizationIds, scope };
	} catch (error) {
		// Don't log expected hourly-rotation expiries, and log only the terse
		// message otherwise: the full error dumped a stack trace + decoded
		// payload (plaintext emails) on every request at relay volume.
		const code =
			error instanceof Error && "code" in error
				? (error as { code?: string }).code
				: undefined;
		if (code !== "ERR_JWT_EXPIRED") {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[relay] JWT verification failed: ${message}`);
		}
		return null;
	}
}
