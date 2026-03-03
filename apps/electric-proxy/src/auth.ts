import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthContext {
	sub: string;
	email: string;
	organizationIds: string[];
}

export interface WhereClause {
	fragment: string;
	params: unknown[];
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
		const email = payload.email as string | undefined;
		const organizationIds = payload.organizationIds as string[] | undefined;

		if (!sub || !organizationIds) {
			return null;
		}

		return { sub, email: email ?? "", organizationIds };
	} catch {
		return null;
	}
}
