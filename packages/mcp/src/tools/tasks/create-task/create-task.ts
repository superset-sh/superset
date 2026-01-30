import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, dbWs } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

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

export function register(server: McpServer) {
	server.registerTool(
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
			outputSchema: {
				created: z.array(
					z.object({
						id: z.string(),
						slug: z.string(),
						title: z.string(),
					}),
				),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const taskInputs = args.tasks as TaskInput[];

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

			const baseSlugs = taskInputs.map((t) => generateBaseSlug(t.title));
			const uniqueBaseSlugs = [...new Set(baseSlugs)];

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

			const usedSlugs = new Set(existingTasks.map((t) => t.slug));

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
				usedSlugs.add(slug);

				const priority: TaskPriority = isPriority(input.priority)
					? input.priority
					: "none";

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

			const createdTasks = await dbWs.transaction(async (tx) => {
				return tx
					.insert(tasks)
					.values(taskValues)
					.returning({ id: tasks.id, slug: tasks.slug, title: tasks.title });
			});

			return {
				structuredContent: { created: createdTasks },
				content: [
					{
						type: "text",
						text: JSON.stringify({ created: createdTasks }, null, 2),
					},
				],
			};
		},
	);
}
