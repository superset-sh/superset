import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections, v2Projects } from "@superset/db/schema";
import { and, desc, eq } from "drizzle-orm";
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

export type LinearClientLookup =
	| { organizationId: string }
	| { projectId: string }
	| { connectionId: string };

type ResolvedConnection = {
	id: string;
	accessToken: string;
	refreshToken: string | null;
	tokenExpiresAt: Date | null;
	disconnectedAt: Date | null;
};

async function resolveConnection(
	args: LinearClientLookup,
): Promise<ResolvedConnection | null> {
	if ("connectionId" in args) {
		const row = await db.query.integrationConnections.findFirst({
			where: eq(integrationConnections.id, args.connectionId),
			columns: {
				id: true,
				accessToken: true,
				refreshToken: true,
				tokenExpiresAt: true,
				disconnectedAt: true,
				provider: true,
			},
		});
		if (!row || row.provider !== "linear") return null;
		return row;
	}

	if ("projectId" in args) {
		const project = await db.query.v2Projects.findFirst({
			where: eq(v2Projects.id, args.projectId),
			columns: { organizationId: true, linearConnectionId: true },
		});
		if (!project) return null;

		if (project.linearConnectionId) {
			const row = await db.query.integrationConnections.findFirst({
				where: eq(integrationConnections.id, project.linearConnectionId),
				columns: {
					id: true,
					accessToken: true,
					refreshToken: true,
					tokenExpiresAt: true,
					disconnectedAt: true,
				},
			});
			return row ?? null;
		}

		// Fall through to "the org's only Linear connection" if exactly one exists.
		return resolveOrgFallback(project.organizationId);
	}

	return resolveOrgFallback(args.organizationId);
}

async function resolveOrgFallback(
	organizationId: string,
): Promise<ResolvedConnection | null> {
	const rows = await db
		.select({
			id: integrationConnections.id,
			accessToken: integrationConnections.accessToken,
			refreshToken: integrationConnections.refreshToken,
			tokenExpiresAt: integrationConnections.tokenExpiresAt,
			disconnectedAt: integrationConnections.disconnectedAt,
		})
		.from(integrationConnections)
		.where(
			and(
				eq(integrationConnections.organizationId, organizationId),
				eq(integrationConnections.provider, "linear"),
			),
		)
		.orderBy(desc(integrationConnections.updatedAt));

	if (rows.length === 0) return null;
	if (rows.length > 1) {
		console.warn(
			`[getLinearClient] Org ${organizationId} has ${rows.length} Linear connections; falling back to most recently updated. Caller should pass { projectId } or { connectionId } instead.`,
		);
	}
	return rows[0] ?? null;
}

export async function getLinearClient(
	args: LinearClientLookup,
): Promise<LinearClient | null> {
	const connection = await resolveConnection(args);
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
