/** What an OAuth access token carries beyond the provider's own claims. */
export interface OAuthAccessTokenClaims {
	organizationId: string | undefined;
	organizationIds: string[];
	client_name: string | undefined;
}

/**
 * The consent screen grants one organization, and `jwtProcedure` and the relay
 * authorize straight off `organizationIds` without re-reading the consent. So
 * the list holds that one organization and nothing else — the user's other
 * memberships were never consented to (GHSA-qgxp-94x7-cf7q).
 *
 * `referenceId` is the consented organization; it is absent for a token with no
 * organization behind it (client credentials), which can then reach none.
 */
export function oauthAccessTokenClaims({
	referenceId,
	metadata,
}: {
	referenceId?: string;
	metadata?: Record<string, unknown>;
}): OAuthAccessTokenClaims {
	const clientName = metadata?.client_name;
	return {
		organizationId: referenceId ?? undefined,
		organizationIds: referenceId ? [referenceId] : [],
		client_name: typeof clientName === "string" ? clientName : undefined,
	};
}
