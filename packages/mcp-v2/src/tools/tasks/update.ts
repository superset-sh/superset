import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_update",
		description:
			"Update fields on an existing task. Only the fields you pass are changed. Omitting a field preserves its current value (set null explicitly to clear nullable fields).",
		inputSchema: {
			id: z
				.string()
				.uuid()
				.describe("Task UUID. Use tasks_get to resolve a slug to UUID first."),
			title: z.string().min(1).optional(),
			description: z.string().nullish(),
			statusId: z.string().uuid().optional(),
			priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
			assigneeId: z.string().uuid().nullish(),
			prUrl: z.string().url().nullish(),
			estimate: z.number().int().positive().nullish(),
			dueDate: z.string().datetime().nullish().describe("ISO 8601 due date."),
			labels: z.array(z.string()).nullish(),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.task.update(input);
		},
	});
}
