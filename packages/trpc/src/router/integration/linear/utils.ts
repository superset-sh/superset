import { LinearClient } from "@linear/sdk";
import type { SelectConnection } from "@superset/db/schema";
import { decryptSecret, userConnection } from "../../../lib/connectors";
import { markDisconnected, REFRESH_BUFFER_MS } from "../token-refresh";
import { isLinearAuthError, refreshLinearToken } from "./refresh";

type Priority = "urgent" | "high" | "medium" | "low" | "none";

export function mapPriorityToLinear(priority: Priority): number {
	switch (priority) {
		case "urgent":
			return 1;
		case "high":
			return 2;
		case "medium":
			return 3;
		case "low":
			return 4;
		default:
			return 0;
	}
}

export function mapPriorityFromLinear(linearPriority: number): Priority {
	switch (linearPriority) {
		case 1:
			return "urgent";
		case 2:
			return "high";
		case 3:
			return "medium";
		case 4:
			return "low";
		default:
			return "none";
	}
}

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
