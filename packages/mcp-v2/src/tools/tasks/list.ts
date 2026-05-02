import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_list",
		description:
			"List tasks in the active organization, optionally filtered by status, priority, assignee, or a free-text search. Use this when the user asks 'what tasks are open', 'find tasks about X', or 'what's assigned to me'.",
		inputSchema: {
			statusId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Filter by status ID. UUIDs only — call tasks_list first if you don't have one.",
				),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.nullish()
				.describe("Filter by priority."),
			assigneeId: z
				.string()
				.uuid()
				.nullish()
				.describe("Filter by assignee user ID."),
			assigneeMe: z
				.boolean()
				.nullish()
				.describe("Shorthand for tasks assigned to the calling user."),
			creatorMe: z
				.boolean()
				.nullish()
				.describe("Shorthand for tasks created by the calling user."),
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
			return caller.task.list(input ?? {});
		},
	});
}
