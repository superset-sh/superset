import { db, dbWs } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { registerTool } from "../../utils";

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
type TaskPriority = (typeof PRIORITIES)[number];

function isPriority(value: unknown): value is TaskPriority {
	return PRIORITIES.includes(value as TaskPriority);
}

export const register = registerTool(
	"create_task",
	{
		description: "Create a new task in the organization",
		inputSchema: {
			title: z.string().min(1).describe("Task title"),
			description: z
				.string()
				.optional()
				.describe("Task description (markdown)"),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.default("none")
				.describe("Task priority"),
			assigneeId: z.string().uuid().optional().describe("User ID to assign to"),
			statusId: z
				.string()
				.uuid()
				.optional()
				.describe("Status ID (defaults to backlog)"),
			labels: z.array(z.string()).optional().describe("Array of label strings"),
			dueDate: z
				.string()
				.datetime()
				.optional()
				.describe("Due date in ISO format"),
			estimate: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Estimate in points/hours"),
		},
	},
	async (params, ctx) => {
		const title = params.title as string;
		const description = params.description as string | undefined;
		const priorityParam = params.priority;
		const priority: TaskPriority = isPriority(priorityParam)
			? priorityParam
			: "none";
		const assigneeId = params.assigneeId as string | undefined;
		const labels = params.labels as string[] | undefined;
		const dueDate = params.dueDate as string | undefined;
		const estimate = params.estimate as number | undefined;

		let statusId = params.statusId as string | undefined;
		if (!statusId) {
			const [defaultStatus] = await db
				.select({ id: taskStatuses.id })
				.from(taskStatuses)
				.where(
					and(
						eq(taskStatuses.organizationId, ctx.organizationId),
						eq(taskStatuses.type, "backlog"),
					),
				)
				.orderBy(taskStatuses.position)
				.limit(1);

			statusId = defaultStatus?.id;
			if (!statusId) {
				return {
					content: [{ type: "text", text: "Error: No default status found" }],
					isError: true,
				};
			}
		}

		const baseSlug = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 50);

		const existingTasks = await db
			.select({ slug: tasks.slug })
			.from(tasks)
			.where(
				and(
					eq(tasks.organizationId, ctx.organizationId),
					ilike(tasks.slug, `${baseSlug}%`),
				),
			);

		let slug = baseSlug;
		if (existingTasks.length > 0) {
			const existing = new Set(existingTasks.map((t) => t.slug));
			let counter = 1;
			while (existing.has(slug)) slug = `${baseSlug}-${counter++}`;
		}

		const result = await dbWs.transaction(async (tx) => {
			const [task] = await tx
				.insert(tasks)
				.values({
					slug,
					title,
					description: description ?? null,
					priority,
					statusId,
					organizationId: ctx.organizationId,
					creatorId: ctx.userId,
					assigneeId: assigneeId ?? null,
					labels: labels ?? [],
					dueDate: dueDate ? new Date(dueDate) : null,
					estimate: estimate ?? null,
				})
				.returning();

			const txid = await getCurrentTxid(tx);
			return { task, txid };
		});

		if (!result.task) {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ error: "Failed to create task", txid: result.txid },
							null,
							2,
						),
					},
				],
				isError: true,
			};
		}

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							id: result.task.id,
							slug: result.task.slug,
							title: result.task.title,
							txid: result.txid,
						},
						null,
						2,
					),
				},
			],
		};
	},
);
