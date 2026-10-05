import type { SelectConnection } from "@superset/db/schema";
import { decryptOptional, decryptSecret } from "../../plugins/crypto";
import { markDisconnected } from "../token-refresh";
import { trackTasksInSupersetWithoutLinear } from "./tracker";

export const SYNC_SUSPENDED = "sync_suspended";

export type RevokeOutcome = "revoked" | "rate_limited" | "failed";

/**
 * De-authorizes the app for this connection at Linear and marks the row
 * disconnected. Linear creates its webhook per authorizing organization, so
 * once every connection to that organization is revoked the deliveries stop
 * at Linear; there is no per-organization pause to reach for instead, and
 * coming back is the Connect flow again.
 *
 * Both tokens are revoked: the docs describe the endpoint per token and do
 * not say that revoking one invalidates the other. An already-revoked token
 * answers 400, which is the outcome wanted.
 */
export async function revokeLinearConnection(
	connection: SelectConnection,
): Promise<RevokeOutcome> {
	const tokens = [
		{
			token: await decryptSecret(connection.accessToken),
			hint: "access_token",
		},
		{
			token: await decryptOptional(connection.refreshToken),
			hint: "refresh_token",
		},
	];
	for (const { token, hint } of tokens) {
		if (!token) continue;
		const response = await fetch("https://api.linear.app/oauth/revoke", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ token, token_type_hint: hint }),
			signal: AbortSignal.timeout(10_000),
		});
		if (response.status === 429) return "rate_limited";
		if (!response.ok && response.status !== 400 && response.status !== 401) {
			console.error(
				`[linear/revoke] ${hint} for connection ${connection.id} answered ${response.status}`,
			);
			return "failed";
		}
	}
	await markDisconnected(connection.id, SYNC_SUSPENDED, { clearTokens: true });
	await trackTasksInSupersetWithoutLinear(connection.organizationId);
	return "revoked";
}
