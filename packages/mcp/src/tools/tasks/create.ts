import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	findLinearStateId,
	findLinearTeam,
	findLinearUserId,
} from "@superset/trpc/linear-lookup";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import {
	rejectUnsupported,
	resolveTracker,
	trackerInput,
	withLookupHint,
} from "./tracker";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_create",
		annotations: { destructiveHint: false },
		description:
			"Create a task in the active organization, or a Linear issue when the organization tracks tasks in Linear. Use this when the user describes work they want to track. The task is auto-assigned a default status if statusId is omitted.",
		inputSchema: {
			tracker: trackerInput,
			title: z.string().min(1).describe("Task title."),
			description: z.string().nullish().describe("Optional task description."),
			statusId: z
				.string()
				.nullish()
				.describe(
					"Status UUID, or for Linear a status name or id in the team. Omit for the default status.",
				),
			team: z
				.string()
				.min(1)
				.nullish()
				.describe(
					"Linear only: team key, e.g. ENG. Needed when the Linear workspace has several teams.",
				),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.default("none")
				.describe("Task priority. Defaults to 'none'."),
			assigneeId: z
				.string()
				.nullish()
				.describe(
					"Assignee: a Superset user ID, or for Linear a Linear user id or email. Omit for unassigned.",
				),
			estimate: z
				.number()
				.int()
				.positive()
				.nullish()
				.describe("Story-point estimate."),
			dueDate: z.string().datetime().nullish().describe("ISO 8601 due date."),
			labels: z
				.array(z.string())
				.nullish()
				.describe("Superset only: free-text labels."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { tracker, team, ...task } = input;
			if ((await resolveTracker(caller, tracker)) === "superset") {
				if (team) throw new Error("team only applies to Linear issues");
				return caller.task.create(task);
			}

			rejectUnsupported({ labels: task.labels });
			const organizationId = ctx.organizationId;
			const workspace = await caller.integration.linear.workspace({
				organizationId,
			});
			const linearTeam = withLookupHint(() =>
				findLinearTeam(workspace, team ?? undefined, "team"),
			);
			return caller.integration.linear.createIssue({
				organizationId,
				teamId: linearTeam.id,
				title: task.title,
				description: task.description ?? undefined,
				priority: task.priority,
				stateId: task.statusId
					? withLookupHint(() =>
							findLinearStateId(linearTeam, task.statusId as string),
						)
					: undefined,
				assigneeId: task.assigneeId
					? withLookupHint(() =>
							findLinearUserId(workspace, task.assigneeId as string),
						)
					: undefined,
				estimate: task.estimate ?? undefined,
				dueDate: task.dueDate ? task.dueDate.slice(0, 10) : undefined,
			});
		},
	});
}
