import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, dbWs } from "@superset/db/client";
import type { InsertTaskStatus } from "@superset/db/schema";
import { taskStatuses, tasks } from "@superset/db/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

const DEFAULT_STATUSES: Array<
	Pick<InsertTaskStatus, "name" | "color" | "type" | "position">
> = [
	{ name: "Backlog", color: "#95a2b3", type: "backlog", position: 0 },
	{ name: "Todo", color: "#e2e2e2", type: "todo", position: 1 },
	{ name: "In Progress", color: "#f2c94c", type: "working", position: 2 },
	{ name: "Done", color: "#0e9f6e", type: "completed", position: 3 },
	{ name: "Canceled", color: "#95a2b3", type: "canceled", position: 4 },
];

async function ensureDefaultStatuses(
	organizationId: string,
): Promise<string> {
	return dbWs.transaction(async (tx) => {
		// Serialize per-org to prevent concurrent first-run races from
		// inserting duplicate default statuses.
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);

		// Check for ANY existing statuses, not just backlog — avoid inserting
		// defaults when the org already has statuses from another source.
		const [existing] = await tx
			.select({ id: taskStatuses.id, type: taskStatuses.type })
			.from(taskStatuses)
			.where(eq(taskStatuses.organizationId, organizationId))
			.orderBy(taskStatuses.position)
			.limit(1);

		if (existing) {
			// Org has statuses — find the backlog one specifically.
			if (existing.type === "backlog") return existing.id;

			const [backlog] = await tx
				.select({ id: taskStatuses.id })
				.from(taskStatuses)
				.where(
					and(
						eq(taskStatuses.organizationId, organizationId),
						eq(taskStatuses.type, "backlog"),
					),
				)
				.orderBy(taskStatuses.position)
				.limit(1);

			if (!backlog) {
				throw new Error(
					"Organization has task statuses but no backlog status",
				);
			}
			return backlog.id;
		}

		// No statuses at all — seed defaults.
		const rows = DEFAULT_STATUSES.map((s) => ({
			...s,
			organizationId,
		}));

		const created = await tx
			.insert(taskStatuses)
			.values(rows)
			.returning({ id: taskStatuses.id, type: taskStatuses.type });

		const backlog = created.find((s) => s.type === "backlog");
		if (!backlog) throw new Error("Failed to seed default task statuses");
		return backlog.id;
	});
}

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
				defaultStatusId = await ensureDefaultStatuses(ctx.organizationId);
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
				assigneeExternalId: string | null;
				assigneeDisplayName: string | null;
				assigneeAvatarUrl: string | null;
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
					assigneeExternalId: null,
					assigneeDisplayName: null,
					assigneeAvatarUrl: null,
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
