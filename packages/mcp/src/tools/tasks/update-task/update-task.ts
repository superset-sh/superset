import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, dbWs } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

const nonEmptyStatusName = z.string().trim().min(1);

const updateSchema = z.object({
	taskId: z.string().describe("Task ID (uuid) or slug"),
	title: z.string().min(1).optional().describe("New title"),
	description: z.string().optional().describe("New description"),
	priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
	assigneeId: z
		.string()
		.uuid()
		.nullable()
		.optional()
		.describe("New assignee (null to unassign)"),
	statusId: z.string().uuid().optional().describe("New status ID"),
	statusName: nonEmptyStatusName
		.optional()
		.describe(
			'New status/section name (for example "Todo", "In Progress", or "In Review")',
		),
	labels: z.array(z.string()).optional().describe("Replace labels"),
	dueDate: z
		.string()
		.datetime()
		.nullable()
		.optional()
		.describe("New due date (null to clear)"),
	estimate: z.number().int().positive().nullable().optional(),
});

type UpdateInput = z.infer<typeof updateSchema>;
type TaskStatusRecord = {
	id: string;
	name: string;
	color: string;
	type: string;
	position: number;
	progressPercent: number | null;
};

function normalizeStatusName(name: string) {
	return name.trim().toLowerCase();
}

function findStatusByName(
	statuses: TaskStatusRecord[],
	statusName: string,
): TaskStatusRecord | null | "ambiguous" {
	const normalizedName = normalizeStatusName(statusName);
	const matches = statuses.filter(
		(status) => normalizeStatusName(status.name) === normalizedName,
	);

	if (matches.length === 0) {
		return null;
	}

	if (matches.length > 1) {
		return "ambiguous";
	}

	return matches[0] ?? null;
}

export function register(server: McpServer) {
	server.registerTool(
		"update_task",
		{
			description: "Update one or more existing tasks",
			inputSchema: {
				updates: z
					.array(updateSchema)
					.min(1)
					.max(25)
					.describe("Array of task updates (1-25)"),
			},
			outputSchema: {
				updated: z.array(
					z.object({
						id: z.string(),
						slug: z.string(),
						title: z.string(),
						statusId: z.string().nullable(),
						statusName: z.string().nullable(),
						statusType: z.string().nullable(),
						statusColor: z.string().nullable(),
						statusProgress: z.number().nullable(),
					}),
				),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const updates = args.updates as UpdateInput[];
			const statuses = await db
				.select({
					id: taskStatuses.id,
					name: taskStatuses.name,
					color: taskStatuses.color,
					type: taskStatuses.type,
					position: taskStatuses.position,
					progressPercent: taskStatuses.progressPercent,
				})
				.from(taskStatuses)
				.where(eq(taskStatuses.organizationId, ctx.organizationId));
			const statusesById = new Map(
				statuses.map((status) => [status.id, status]),
			);

			const resolvedUpdates: {
				taskId: string;
				updateData: Record<string, unknown>;
				resolvedStatusId?: string;
			}[] = [];

			for (const [i, update] of updates.entries()) {
				const taskId = update.taskId;
				const isUuid = z.string().uuid().safeParse(taskId).success;

				const [existingTask] = await db
					.select({ id: tasks.id })
					.from(tasks)
					.where(
						and(
							isUuid ? eq(tasks.id, taskId) : eq(tasks.slug, taskId),
							eq(tasks.organizationId, ctx.organizationId),
							isNull(tasks.deletedAt),
						),
					)
					.limit(1);

				if (!existingTask) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task not found: ${taskId} (index ${i})`,
							},
						],
						isError: true,
					};
				}

				const updateData: Record<string, unknown> = {};
				if (update.title !== undefined) updateData.title = update.title;
				if (update.description !== undefined)
					updateData.description = update.description;
				if (update.priority !== undefined)
					updateData.priority = update.priority;
				if (update.assigneeId !== undefined) {
					updateData.assigneeId = update.assigneeId;
					updateData.assigneeExternalId = null;
					updateData.assigneeDisplayName = null;
					updateData.assigneeAvatarUrl = null;
				}
				let resolvedStatusId: string | undefined;
				if (update.statusId !== undefined || update.statusName !== undefined) {
					const statusFromId =
						update.statusId !== undefined
							? (statusesById.get(update.statusId) ?? null)
							: null;

					if (update.statusId !== undefined && !statusFromId) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Status not found in organization: ${update.statusId} (index ${i})`,
								},
							],
							isError: true,
						};
					}

					const statusFromName =
						update.statusName !== undefined
							? findStatusByName(statuses, update.statusName)
							: null;

					if (statusFromName === "ambiguous") {
						return {
							content: [
								{
									type: "text",
									text: `Error: Multiple statuses match "${update.statusName}" in this organization; use statusId instead (index ${i})`,
								},
							],
							isError: true,
						};
					}

					if (update.statusName !== undefined && !statusFromName) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Status not found in organization: ${update.statusName} (index ${i})`,
								},
							],
							isError: true,
						};
					}

					if (
						statusFromId &&
						statusFromName &&
						statusFromId.id !== statusFromName.id
					) {
						return {
							content: [
								{
									type: "text",
									text: `Error: statusId and statusName refer to different statuses for task: ${taskId} (index ${i})`,
								},
							],
							isError: true,
						};
					}

					resolvedStatusId = statusFromName?.id ?? statusFromId?.id;
					updateData.statusId = resolvedStatusId;
				}
				if (update.labels !== undefined) updateData.labels = update.labels;
				if (update.dueDate !== undefined)
					updateData.dueDate = update.dueDate ? new Date(update.dueDate) : null;
				if (update.estimate !== undefined)
					updateData.estimate = update.estimate;

				if (Object.keys(updateData).length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `Error: No updatable fields provided for task: ${taskId} (index ${i})`,
							},
						],
						isError: true,
					};
				}

				resolvedUpdates.push({
					taskId: existingTask.id,
					updateData,
					...(resolvedStatusId ? { resolvedStatusId } : {}),
				});
			}

			const updatedTasks: Array<{
				id: string;
				slug: string;
				title: string;
				statusId: string | null;
				statusName: string | null;
				statusType: string | null;
				statusColor: string | null;
				statusProgress: number | null;
			}> = [];

			for (const { taskId, updateData, resolvedStatusId } of resolvedUpdates) {
				const [task] = await dbWs
					.update(tasks)
					.set(updateData)
					.where(eq(tasks.id, taskId))
					.returning({
						id: tasks.id,
						slug: tasks.slug,
						title: tasks.title,
						statusId: tasks.statusId,
					});

				if (task) {
					const status =
						statusesById.get(resolvedStatusId ?? task.statusId) ?? null;

					updatedTasks.push({
						...task,
						statusName: status?.name ?? null,
						statusType: status?.type ?? null,
						statusColor: status?.color ?? null,
						statusProgress: status?.progressPercent ?? null,
					});
				}
			}

			const data = { updated: updatedTasks };
			return {
				structuredContent: data,
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
			};
		},
	);
}
