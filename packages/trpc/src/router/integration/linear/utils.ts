import { LinearClient } from "@linear/sdk";
import type { SelectConnection } from "@superset/db/schema";
import { decryptSecret, userConnection } from "../../../lib/connectors";
import { markDisconnected, REFRESH_BUFFER_MS } from "../token-refresh";
import { isLinearAuthError, refreshLinearToken } from "./refresh";

export async function getLinearClient(
	organizationId: string,
	userId: string,
): Promise<LinearClient | null> {
	const connection = await userConnection(organizationId, "linear", userId, {
		includeDisconnected: true,
	});
	return connection ? linearClientFor(connection) : null;
}

export async function linearClientFor(
	connection: SelectConnection,
): Promise<LinearClient | null> {
	if (connection.disconnectedAt) {
		return null;
	}

	if (connection.authMethod === "api_key") {
		return new LinearClient({
			apiKey: await decryptSecret(connection.accessToken),
		});
	}

	const expiresSoon =
		connection.tokenExpiresAt &&
		connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

	if (expiresSoon) {
		if (!connection.refreshToken) {
			await markDisconnected(connection.id, "no_refresh_token");
			return null;
		}
		try {
			const result = await refreshLinearToken(connection.id);
			if (result.disconnected) return null;
			return new LinearClient({ accessToken: result.accessToken });
		} catch (error) {
			const tokenStillValid =
				connection.tokenExpiresAt &&
				connection.tokenExpiresAt.getTime() > Date.now();
			if (tokenStillValid && !isLinearAuthError(error)) {
				return new LinearClient({
					accessToken: await decryptSecret(connection.accessToken),
				});
			}
			throw error;
		}
	}

	return new LinearClient({
		accessToken: await decryptSecret(connection.accessToken),
	});
}
