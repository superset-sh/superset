import { db, dbWs } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { registerTool } from "../../utils";

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
type TaskPriority = (typeof PRIORITIES)[number];

function isPriority(value: unknown): value is TaskPriority {
	return PRIORITIES.includes(value as TaskPriority);
}

const taskInputSchema = z.object({
	title: z.string().min(1).describe("Task title"),
	description: z.string().optional().describe("Task description (markdown)"),
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
	dueDate: z.string().datetime().optional().describe("Due date in ISO format"),
	estimate: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Estimate in points/hours"),
});

type TaskInput = z.infer<typeof taskInputSchema>;

function generateBaseSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}

function generateUniqueSlug(
	baseSlug: string,
	existingSlugs: Set<string>,
): string {
	let slug = baseSlug;
	if (existingSlugs.has(slug)) {
		let counter = 1;
		while (existingSlugs.has(slug)) {
			slug = `${baseSlug}-${counter++}`;
		}
	}
	return slug;
}

export const register = registerTool(
	"create_task",
	{
		description: "Create one or more tasks in the organization",
		inputSchema: {
			tasks: z
				.array(taskInputSchema)
				.min(1)
				.max(25)
				.describe("Array of tasks to create (1-25)"),
		},
	},
	async (params, ctx) => {
		const taskInputs = params.tasks as TaskInput[];

		// Get default status if needed
		let defaultStatusId: string | undefined;
		const needsDefaultStatus = taskInputs.some((t) => !t.statusId);

		if (needsDefaultStatus) {
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

			defaultStatusId = defaultStatus?.id;
			if (!defaultStatusId) {
				return {
					content: [{ type: "text", text: "Error: No default status found" }],
					isError: true,
				};
			}
		}

		// Collect all base slugs to query existing ones
		const baseSlugs = taskInputs.map((t) => generateBaseSlug(t.title));
		const uniqueBaseSlugs = [...new Set(baseSlugs)];

		// Query all potentially conflicting slugs in one go
		const slugConditions = uniqueBaseSlugs.map((baseSlug) =>
			ilike(tasks.slug, `${baseSlug}%`),
		);

		const existingTasks = await db
			.select({ slug: tasks.slug })
			.from(tasks)
			.where(
				and(
					eq(tasks.organizationId, ctx.organizationId),
					or(...slugConditions),
				),
			);

		// Track all used slugs (DB + in-batch)
		const usedSlugs = new Set(existingTasks.map((t) => t.slug));

		// Prepare all task values with unique slugs
		const taskValues: Array<{
			slug: string;
			title: string;
			description: string | null;
			priority: TaskPriority;
			statusId: string;
			organizationId: string;
			creatorId: string;
			assigneeId: string | null;
			labels: string[];
			dueDate: Date | null;
			estimate: number | null;
		}> = [];

		for (const [i, input] of taskInputs.entries()) {
			const baseSlug = baseSlugs[i] ?? "";
			const slug = generateUniqueSlug(baseSlug, usedSlugs);

			// Add to used slugs to prevent intra-batch collisions
			usedSlugs.add(slug);

			const priority: TaskPriority = isPriority(input.priority)
				? input.priority
				: "none";

			// Use input.statusId if provided, otherwise fall back to defaultStatusId
			// defaultStatusId is guaranteed to exist if any task needed it (checked earlier)
			const statusId = input.statusId ?? (defaultStatusId as string);

			taskValues.push({
				slug,
				title: input.title,
				description: input.description ?? null,
				priority,
				statusId,
				organizationId: ctx.organizationId,
				creatorId: ctx.userId,
				assigneeId: input.assigneeId ?? null,
				labels: input.labels ?? [],
				dueDate: input.dueDate ? new Date(input.dueDate) : null,
				estimate: input.estimate ?? null,
			});
		}

		// Insert all tasks in a single transaction
		const result = await dbWs.transaction(async (tx) => {
			const createdTasks = await tx
				.insert(tasks)
				.values(taskValues)
				.returning({ id: tasks.id, slug: tasks.slug, title: tasks.title });

			const txid = await getCurrentTxid(tx);
			return { createdTasks, txid };
		});

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							created: result.createdTasks,
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
