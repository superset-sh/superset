import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_create",
		description:
			"Create a task in the active organization. Use this when the user describes work they want to track. The task is auto-assigned a default status if statusId is omitted.",
		inputSchema: {
			title: z.string().min(1).describe("Task title."),
			description: z.string().nullish().describe("Optional task description."),
			statusId: z
				.string()
				.uuid()
				.nullish()
				.describe("Status UUID. Omit to use the org's default status."),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.default("none")
				.describe("Task priority. Defaults to 'none'."),
			assigneeId: z
				.string()
				.uuid()
				.nullish()
				.describe("Assignee user ID. Omit for unassigned."),
			estimate: z
				.number()
				.int()
				.positive()
				.nullish()
				.describe("Story-point estimate."),
			dueDate: z.string().datetime().nullish().describe("ISO 8601 due date."),
			labels: z.array(z.string()).nullish().describe("Free-text labels."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.task.create(input);
		},
	});
}
