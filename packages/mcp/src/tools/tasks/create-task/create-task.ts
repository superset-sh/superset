import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dbWs } from "@superset/db/client";
import { tasks, teamKeys } from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import {
	allocateTaskNumberRange,
	resolveDefaultTeam,
} from "@superset/db/teams";
import { and, eq, isNull } from "drizzle-orm";
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

			const createdTasks = await dbWs.transaction(async (tx) => {
				let defaultStatusId: string | undefined;
				const needsDefaultStatus = taskInputs.some((t) => !t.statusId);
				if (needsDefaultStatus) {
					defaultStatusId = await seedDefaultStatuses(ctx.organizationId, tx);
				}

				const teamId = await resolveDefaultTeam(ctx.organizationId, tx);
				const startNumber = await allocateTaskNumberRange(
					teamId,
					taskInputs.length,
					tx,
				);
				const [teamKey] = await tx
					.select({ key: teamKeys.key })
					.from(teamKeys)
					.where(and(eq(teamKeys.teamId, teamId), isNull(teamKeys.retiredAt)))
					.limit(1);
				if (!teamKey) {
					throw new Error(`No current key for team ${teamId}`);
				}

				const taskValues = taskInputs.map((input, i) => {
					const number = startNumber + i;
					const priority: TaskPriority = isPriority(input.priority)
						? input.priority
						: "none";
					const statusId = input.statusId ?? (defaultStatusId as string);

					return {
						slug: `${teamKey.key}-${number}`,
						teamId,
						number,
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
					};
				});

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
