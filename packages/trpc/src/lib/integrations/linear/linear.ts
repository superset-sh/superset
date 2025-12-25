import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import type { SelectTask } from "@superset/db/schema";
import { integrationConnections, tasks } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { env } from "../../../env";

/**
 * Map our priority to Linear priority (0-4)
 * Linear: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
 */
export function mapPriorityToLinear(
	priority: "urgent" | "high" | "medium" | "low" | "none",
): number {
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

/**
 * Map Linear priority to our priority
 */
export function mapPriorityFromLinear(
	linearPriority: number,
): "urgent" | "high" | "medium" | "low" | "none" {
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

/**
 * Get Linear client for an organization
 */
export async function getLinearClient(
	organizationId: string,
): Promise<LinearClient | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
			eq(integrationConnections.syncEnabled, true),
		),
	});

	if (!connection) {
		return null;
	}

	return new LinearClient({
		accessToken: connection.accessToken,
	});
}

/**
 * Get the default team ID from the connection config
 */
export async function getDefaultTeamId(
	organizationId: string,
): Promise<string | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection?.config) {
		return null;
	}

	const config = connection.config as { defaultTeamId?: string };
	return config.defaultTeamId ?? null;
}

/**
 * Find Linear state by name
 */
async function findLinearState(
	client: LinearClient,
	teamId: string,
	statusName: string,
): Promise<string | undefined> {
	const team = await client.team(teamId);
	const states = await team.states();

	// Try exact match first
	const exactMatch = states.nodes.find(
		(s) => s.name.toLowerCase() === statusName.toLowerCase(),
	);
	if (exactMatch) {
		return exactMatch.id;
	}

	// Try partial match
	const partialMatch = states.nodes.find((s) =>
		s.name.toLowerCase().includes(statusName.toLowerCase()),
	);
	return partialMatch?.id;
}

/**
 * Sync a task to Linear
 *
 * Creates a new issue in Linear if the task doesn't have an externalId,
 * or updates the existing issue if it does.
 */
export async function syncTaskToLinear(
	task: SelectTask,
	teamId: string,
): Promise<{
	success: boolean;
	externalId?: string;
	externalKey?: string;
	externalUrl?: string;
	error?: string;
}> {
	const client = await getLinearClient(task.organizationId);

	if (!client) {
		return { success: false, error: "No Linear connection found" };
	}

	try {
		// Find the state ID for the task's status
		const stateId = await findLinearState(client, teamId, task.status);

		if (task.externalProvider === "linear" && task.externalId) {
			// Update existing issue
			const result = await client.updateIssue(task.externalId, {
				title: task.title,
				description: task.description ?? undefined,
				priority: mapPriorityToLinear(task.priority),
				stateId,
				estimate: task.estimate ?? undefined,
				dueDate: task.dueDate?.toISOString().split("T")[0],
			});

			if (!result.success) {
				return { success: false, error: "Failed to update issue" };
			}

			const issue = await result.issue;
			if (!issue) {
				return { success: false, error: "Issue not returned" };
			}

			// Update the task with sync info
			await db
				.update(tasks)
				.set({
					lastSyncedAt: new Date(),
					syncError: null,
				})
				.where(eq(tasks.id, task.id));

			return {
				success: true,
				externalId: issue.id,
				externalKey: issue.identifier,
				externalUrl: issue.url,
			};
		}

		// Create new issue
		const result = await client.createIssue({
			teamId,
			title: task.title,
			description: task.description ?? undefined,
			priority: mapPriorityToLinear(task.priority),
			stateId,
			estimate: task.estimate ?? undefined,
			dueDate: task.dueDate?.toISOString().split("T")[0],
		});

		if (!result.success) {
			return { success: false, error: "Failed to create issue" };
		}

		const issue = await result.issue;
		if (!issue) {
			return { success: false, error: "Issue not returned" };
		}

		// Update the task with external info
		await db
			.update(tasks)
			.set({
				externalProvider: "linear",
				externalId: issue.id,
				externalKey: issue.identifier,
				externalUrl: issue.url,
				lastSyncedAt: new Date(),
				syncError: null,
			})
			.where(eq(tasks.id, task.id));

		return {
			success: true,
			externalId: issue.id,
			externalKey: issue.identifier,
			externalUrl: issue.url,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Store the sync error
		await db
			.update(tasks)
			.set({
				syncError: errorMessage,
			})
			.where(eq(tasks.id, task.id));

		return { success: false, error: errorMessage };
	}
}

/**
 * Check if an organization has Linear connected
 */
export async function hasLinearConnection(
	organizationId: string,
): Promise<boolean> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	return !!connection;
}

/**
 * Get Linear connection details for an organization
 */
export async function getLinearConnection(organizationId: string) {
	return db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
		columns: {
			id: true,
			externalOrgId: true,
			externalOrgName: true,
			syncEnabled: true,
			config: true,
			createdAt: true,
			updatedAt: true,
		},
	});
}

/**
 * Get available Linear teams for an organization
 */
export async function getLinearTeams(organizationId: string) {
	const client = await getLinearClient(organizationId);

	if (!client) {
		return [];
	}

	try {
		const teams = await client.teams();
		return teams.nodes.map((team) => ({
			id: team.id,
			key: team.key,
			name: team.name,
		}));
	} catch (error) {
		console.error("[linear] Failed to fetch teams:", error);
		return [];
	}
}

/**
 * Update the default team for Linear sync
 */
export async function setDefaultLinearTeam(
	organizationId: string,
	teamId: string,
) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		throw new Error("No Linear connection found");
	}

	const existingConfig = (connection.config as Record<string, unknown>) ?? {};

	await db
		.update(integrationConnections)
		.set({
			config: { ...existingConfig, defaultTeamId: teamId },
		})
		.where(eq(integrationConnections.id, connection.id));
}

/**
 * Disconnect Linear from an organization
 */
export async function disconnectLinear(organizationId: string) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		return { success: false, error: "No connection found" };
	}

	// Try to delete the webhook in Linear
	if (connection.webhookId) {
		try {
			const client = new LinearClient({
				accessToken: connection.accessToken,
			});
			await client.deleteWebhook(connection.webhookId);
		} catch (error) {
			console.error("[linear] Failed to delete webhook:", error);
			// Continue with disconnection even if webhook deletion fails
		}
	}

	// Delete the connection
	await db
		.delete(integrationConnections)
		.where(eq(integrationConnections.id, connection.id));

	return { success: true };
}

// ----- Job Queue -----

const qstash = new Client({ token: env.QSTASH_TOKEN });

interface QueueSyncTaskParams {
	taskId: string;
	teamId?: string;
}

/**
 * Queue a task sync job to be processed by QStash
 */
export async function queueTaskSync({ taskId, teamId }: QueueSyncTaskParams) {
	const response = await qstash.publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}/api/jobs/integrations/linear/sync-task`,
		body: { taskId, teamId },
		retries: 3,
	});

	return response;
}
