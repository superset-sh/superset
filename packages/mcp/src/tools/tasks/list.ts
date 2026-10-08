import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	findLinearTeam,
	findLinearUserId,
	linearStatusFilterValues,
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

const MAX_LINEAR_ISSUES = 500;

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_list",
		annotations: { readOnlyHint: true },
		description:
			"List tasks in the active organization, optionally filtered by status, priority, assignee, or a free-text search. When the organization tracks tasks in Linear this lists its Linear issues. Use this when the user asks 'what tasks are open', 'find tasks about X', or 'what's assigned to me'.",
		inputSchema: {
			tracker: trackerInput,
			statusId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Superset only: filter by status ID. Call tasks_statuses_list if you don't have one.",
				),
			linearStatus: z
				.enum(linearStatusFilterValues)
				.nullish()
				.describe("Linear only: status filter. Defaults to 'active'."),
			team: z
				.string()
				.min(1)
				.nullish()
				.describe("Filter by team key or name, e.g. ENG."),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.nullish()
				.describe("Superset only: filter by priority."),
			assigneeId: z
				.string()
				.min(1)
				.nullish()
				.describe(
					"Filter by assignee: a Superset user ID, or for Linear a Linear user id or email.",
				),
			assigneeMe: z
				.boolean()
				.nullish()
				.describe("Shorthand for tasks assigned to the calling user."),
			creatorMe: z
				.boolean()
				.nullish()
				.describe("Superset only: tasks created by the calling user."),
			search: z
				.string()
				.min(1)
				.nullish()
				.describe("Free-text search on title."),
			limit: z
				.number()
				.int()
				.positive()
				.max(500)
				.default(50)
				.describe("Max tasks to return. Default 50, max 500."),
			offset: z
				.number()
				.int()
				.nonnegative()
				.default(0)
				.describe("Pagination offset."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { tracker, linearStatus, team, ...filters } = input;
			if ((await resolveTracker(caller, tracker)) === "superset") {
				if (linearStatus) {
					throw new Error("linearStatus only applies to Linear issues");
				}
				return caller.task.list({ ...filters, team });
			}
			if (filters.offset + filters.limit > MAX_LINEAR_ISSUES) {
				throw new Error(
					`offset + limit can reach at most ${MAX_LINEAR_ISSUES} Linear issues. Narrow the search instead.`,
				);
			}

			rejectUnsupported({
				statusId: filters.statusId,
				priority: filters.priority,
				creatorMe: filters.creatorMe,
			});
			const organizationId = ctx.organizationId;
			const workspace =
				team || filters.assigneeId
					? await caller.integration.linear.workspace({ organizationId })
					: null;
			const issues = [];
			let cursor: string | null = null;
			do {
				const page = await caller.integration.linear.issues({
					organizationId,
					status: linearStatus ?? "active",
					teamId:
						workspace && team
							? withLookupHint(() => findLinearTeam(workspace, team, "team")).id
							: undefined,
					assignee: filters.assigneeMe
						? "me"
						: workspace && filters.assigneeId
							? withLookupHint(() =>
									findLinearUserId(workspace, filters.assigneeId as string),
								)
							: undefined,
					search: filters.search ?? undefined,
					cursor,
				});
				issues.push(...page.issues);
				cursor = page.nextCursor;
			} while (cursor && issues.length < filters.offset + filters.limit);
			return issues.slice(filters.offset, filters.offset + filters.limit);
		},
	});
}
