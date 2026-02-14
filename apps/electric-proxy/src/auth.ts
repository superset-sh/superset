import { createRemoteJWKSet, jwtVerify } from "jose";

interface VerifiedClaims {
	organizationIds: string[];
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(jwksUrl));
	}
	return jwks;
}

export async function verifyJWT({
	token,
	jwksUrl,
	issuer,
	audience,
}: {
	token: string;
	jwksUrl: string;
	issuer: string;
	audience: string;
}): Promise<VerifiedClaims> {
	const keySet = getJWKS(jwksUrl);

	const { payload } = await jwtVerify(token, keySet, {
		issuer,
		audience,
	});

	const organizationIds = payload.organizationIds;
	if (!Array.isArray(organizationIds)) {
		throw new Error("Missing organizationIds claim");
	}

	return { organizationIds: organizationIds as string[] };
}
