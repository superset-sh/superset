import type { LinearClient, WorkflowState } from "@linear/sdk";
import { db } from "@superset/db/client";
import type { LinearConfig, SelectTask } from "@superset/db/schema";
import {
	integrationConnections,
	members,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import {
	getLinearClient,
	mapPriorityToLinear,
} from "@superset/trpc/integrations/linear";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	taskId: z.string().min(1),
	teamId: z.string().optional(),
});

async function getNewTasksTeamId(
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

	const config = connection.config as LinearConfig;
	return config.newTasksTeamId ?? null;
}

async function findLinearState(
	client: LinearClient,
	teamId: string,
	statusName: string,
): Promise<string | undefined> {
	const team = await client.team(teamId);
	const states = await team.states();
	const match = states.nodes.find(
		(s: WorkflowState) => s.name.toLowerCase() === statusName.toLowerCase(),
	);
	return match?.id;
}

async function resolveLinearAssigneeId(
	client: LinearClient,
	organizationId: string,
	userId: string,
): Promise<string | undefined> {
	const matchedUser = await db
		.select({ email: users.email })
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(
			and(eq(users.id, userId), eq(members.organizationId, organizationId)),
		)
		.limit(1)
		.then((rows) => rows[0]);
	if (!matchedUser?.email) return undefined;

	const linearUsers = await client.users({
		filter: { email: { eq: matchedUser.email } },
	});
	const linearUser = linearUsers.nodes[0];
	if (linearUsers.nodes.length === 1 && linearUser) {
		return linearUser.id;
	}
	return undefined;
}

async function syncTaskToLinear(
	task: SelectTask,
	teamId: string | null,
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
		const taskStatus = await db.query.taskStatuses.findFirst({
			where: eq(taskStatuses.id, task.statusId),
		});

		if (!taskStatus) {
			return { success: false, error: "Task status not found" };
		}

		if (task.externalProvider === "linear" && task.externalId) {
			if (task.deletedAt) {
				await client.archiveIssue(task.externalId);
				await db
					.update(tasks)
					.set({
						lastSyncedAt: new Date(),
						syncError: null,
					})
					.where(eq(tasks.id, task.id));
				return { success: true, externalId: task.externalId };
			}

			const existingIssue = await client.issue(task.externalId);
			const issueTeam = await existingIssue.team;
			const resolvedUpdateTeamId = issueTeam?.id;

			const stateId = resolvedUpdateTeamId
				? await findLinearState(client, resolvedUpdateTeamId, taskStatus.name)
				: undefined;

			let linearAssigneeId: string | null | undefined;
			if (task.assigneeId === null && !task.assigneeExternalId) {
				linearAssigneeId = null;
			} else if (task.assigneeId) {
				linearAssigneeId =
					(await resolveLinearAssigneeId(
						client,
						task.organizationId,
						task.assigneeId,
					)) ?? undefined;
			}

			const result = await client.updateIssue(task.externalId, {
				title: task.title,
				description: task.description ?? undefined,
				priority: mapPriorityToLinear(task.priority),
				stateId,
				estimate: task.estimate ?? undefined,
				dueDate: task.dueDate?.toISOString().split("T")[0],
				...(linearAssigneeId !== undefined && { assigneeId: linearAssigneeId }),
			});

			if (!result.success) {
				return { success: false, error: "Failed to update issue" };
			}

			const issue = await result.issue;
			if (!issue) {
				return { success: false, error: "Issue not returned" };
			}

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

		if (!teamId) {
			return { success: false, error: "No team configured" };
		}

		const stateId = await findLinearState(client, teamId, taskStatus.name);

		const createAssigneeId = task.assigneeId
			? await resolveLinearAssigneeId(
					client,
					task.organizationId,
					task.assigneeId,
				)
			: undefined;

		const result = await client.createIssue({
			teamId,
			title: task.title,
			description: task.description ?? undefined,
			priority: mapPriorityToLinear(task.priority),
			stateId,
			estimate: task.estimate ?? undefined,
			dueDate: task.dueDate?.toISOString().split("T")[0],
			...(createAssigneeId && { assigneeId: createAssigneeId }),
		});

		if (!result.success) {
			return { success: false, error: "Failed to create issue" };
		}

		const issue = await result.issue;
		if (!issue) {
			return { success: false, error: "Issue not returned" };
		}

		await db
			.update(tasks)
			.set({
				slug: issue.identifier,
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

		await db
			.update(tasks)
			.set({ syncError: errorMessage })
			.where(eq(tasks.id, task.id));

		return { success: false, error: errorMessage };
	}
}

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	try {
		const isValid = await receiver.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/sync-task`,
		});

		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	} catch (verifyError) {
		console.error("[sync-task] Signature verification failed:", verifyError);
		return Response.json(
			{ error: "Signature verification failed" },
			{ status: 401 },
		);
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { taskId, teamId } = parsed.data;

	const task = await db.query.tasks.findFirst({
		where: eq(tasks.id, taskId),
	});

	if (!task) {
		return Response.json({ error: "Task not found", skipped: true });
	}

	const resolvedTeamId =
		teamId ?? (await getNewTasksTeamId(task.organizationId));

	const result = await syncTaskToLinear(task, resolvedTeamId);

	if (!result.success) {
		return Response.json({ error: result.error }, { status: 500 });
	}

	return Response.json({
		success: true,
		externalId: result.externalId,
		externalKey: result.externalKey,
	});
}
