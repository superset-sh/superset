import { mintUserJwt } from "@superset/auth/server";
import { env } from "@/env";

export interface HostAccess {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	jwt: string;
}

const HOST_JWT_TTL_SECONDS = 120;

/**
 * How the Slack agent reaches a host through the relay: as the linked user,
 * with a short-lived token scoped to the one organization the thread belongs
 * to, since the relay trusts the token's organization claim.
 */
export async function hostAccessFor(params: {
	userId: string;
	organizationId: string;
	hostId: string;
	scope: string;
}): Promise<HostAccess> {
	return {
		relayUrl: env.RELAY_URL,
		organizationId: params.organizationId,
		hostId: params.hostId,
		jwt: await mintUserJwt({
			userId: params.userId,
			organizationIds: [params.organizationId],
			scope: params.scope,
			ttlSeconds: HOST_JWT_TTL_SECONDS,
		}),
	};
}
