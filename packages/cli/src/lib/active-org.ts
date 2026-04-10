import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "./api-client";
import { decodeJwtPayload } from "./auth";

export type AuthSource = "flag" | "env" | "oauth";

/**
 * Resolve the active organization ID for the current command.
 *
 * - For OAuth bearers (JWTs), the org is baked into the `organizationId` claim
 *   at mint time and decoded locally — no network round-trip.
 * - For API key bearers, the org is pinned in the key's metadata. The CLI
 *   doesn't get that metadata directly, so we hit `user.myOrganization` once
 *   per command (the server returns the org the API key is scoped to via the
 *   tRPC context builder's API key path).
 */
export async function getActiveOrgId(
	api: ApiClient,
	bearer: string,
	source: AuthSource,
): Promise<string> {
	if (source === "oauth") {
		const payload = decodeJwtPayload(bearer);
		const organizationId = payload.organizationId;
		if (typeof organizationId !== "string" || !organizationId) {
			throw new CLIError(
				"OAuth token missing organizationId claim",
				"Run `superset auth login` again.",
			);
		}
		return organizationId;
	}

	const org = await api.user.myOrganization.query();
	if (!org) {
		throw new CLIError(
			"API key has no associated organization",
			"Make sure the key was created with an organization scope.",
		);
	}
	return org.id;
}
