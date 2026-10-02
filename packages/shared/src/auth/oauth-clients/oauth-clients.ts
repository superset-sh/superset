/**
 * Client registration is open to anyone (`allowUnauthenticatedClientRegistration`),
 * so a client id identifies a client only when the OAuth provider minted it
 * into the `azp` claim of a token it signed — never when a caller hands one to
 * us. The provider generates client ids itself at registration, so `azp` cannot
 * be chosen by whoever registers.
 */
export const FIRST_PARTY_OAUTH_CLIENT_IDS = ["superset-cli"] as const;

export type FirstPartyOAuthClientId =
	(typeof FIRST_PARTY_OAUTH_CLIENT_IDS)[number];

/** Whether a verified token's `azp` claim names a client this repo ships. */
export function isFirstPartyOAuthClient(azp: unknown): boolean {
	return (
		typeof azp === "string" &&
		(FIRST_PARTY_OAUTH_CLIENT_IDS as readonly string[]).includes(azp)
	);
}
