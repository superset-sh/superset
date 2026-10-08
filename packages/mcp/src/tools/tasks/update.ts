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
	resolveTask,
	trackerInput,
	withLookupHint,
} from "./tracker";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_update",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Update fields on an existing task, or a Linear issue when the organization tracks tasks in Linear. Only the fields you pass are changed. Omitting a field preserves its current value (set null explicitly to clear nullable fields).",
		inputSchema: {
			id: z
				.string()
				.min(1)
				.describe("Task UUID or slug, or a Linear identifier (e.g. ENG-123)."),
			tracker: trackerInput,
			title: z.string().min(1).optional(),
			description: z.string().nullish(),
			statusId: z
				.string()
				.optional()
				.describe("Status UUID, or for Linear a status name or id."),
			priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
			assigneeId: z
				.string()
				.nullish()
				.describe(
					"Assignee: a Superset user ID, or for Linear a Linear user id or email. Null unassigns.",
				),
			prUrl: z.string().url().nullish().describe("Superset only."),
			estimate: z.number().int().positive().nullish(),
			dueDate: z.string().datetime().nullish().describe("ISO 8601 due date."),
			labels: z.array(z.string()).nullish().describe("Superset only."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { id, tracker, ...changes } = input;
			const resolved = await resolveTask(caller, id, tracker);
			if (resolved.tracker === "superset") {
				return caller.task.update({ ...changes, id: resolved.task.id });
			}

			if (changes.prUrl !== undefined || changes.labels !== undefined) {
				rejectUnsupported({
					prUrl: changes.prUrl !== undefined,
					labels: changes.labels !== undefined,
				});
			}
			const organizationId = ctx.organizationId;
			const needsWorkspace =
				changes.statusId !== undefined || Boolean(changes.assigneeId);
			const [current, workspace] = await Promise.all([
				caller.integration.linear.issue({
					organizationId,
					issueId: resolved.issueId,
				}),
				needsWorkspace
					? caller.integration.linear.workspace({ organizationId })
					: null,
			]);
			return caller.integration.linear.updateIssue({
				organizationId,
				issueId: current.id,
				title: changes.title,
				description: changes.description,
				priority: changes.priority,
				stateId:
					workspace && changes.statusId
						? withLookupHint(() =>
								findLinearStateId(
									findLinearTeam(workspace, current.team.key, "team"),
									changes.statusId as string,
								),
							)
						: undefined,
				assigneeId:
					changes.assigneeId === null
						? null
						: workspace && changes.assigneeId
							? withLookupHint(() =>
									findLinearUserId(workspace, changes.assigneeId as string),
								)
							: undefined,
				estimate: changes.estimate,
				dueDate:
					changes.dueDate === null
						? null
						: changes.dueDate
							? changes.dueDate.slice(0, 10)
							: undefined,
			});
		},
	});
}
