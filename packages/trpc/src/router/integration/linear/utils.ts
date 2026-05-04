import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { REFRESH_BUFFER_MS } from "./constants";
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
): Promise<LinearClient | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection || connection.disconnectedAt) {
		return null;
	}

	const expiresSoon =
		connection.tokenExpiresAt &&
		connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

	if (expiresSoon) {
		if (!connection.refreshToken) {
			await markConnectionDisconnected(connection.id, "no_refresh_token");
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
				return new LinearClient({ accessToken: connection.accessToken });
			}
			throw error;
		}
	}

	return new LinearClient({ accessToken: connection.accessToken });
}

export async function markConnectionDisconnected(
	connectionId: string,
	reason: string,
): Promise<void> {
	await db
		.update(integrationConnections)
		.set({ disconnectedAt: new Date(), disconnectReason: reason })
		.where(eq(integrationConnections.id, connectionId));
}
