/**
 * OAuth clients we trust to mint first-party access tokens carrying a user's
 * org context. Dynamically-registered (DCR) clients are attacker-controllable,
 * so a token whose `azp` (authorized party) names an untrusted client must not
 * be honored on privileged surfaces — otherwise a victim-scoped token minted
 * to an attacker's DCR client grants cross-tenant access (ATO).
 */
export const TRUSTED_API_CLIENTS = new Set(["superset-cli"]);

/**
 * True when the token's `azp` claim is present and names a client outside the
 * trusted set. A missing `azp` (native first-party tokens) is allowed.
 */
export function isUntrustedAuthorizedParty(
	payload: Record<string, unknown>,
): boolean {
	const authorizedClientId =
		typeof payload.azp === "string" ? payload.azp : null;
	return (
		authorizedClientId !== null && !TRUSTED_API_CLIENTS.has(authorizedClientId)
	);
}
