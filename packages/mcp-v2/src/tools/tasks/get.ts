import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_get",
		description:
			"Fetch one task by UUID or human slug. Use this when you have a task ID or slug from a list call or the user.",
		inputSchema: {
			idOrSlug: z
				.string()
				.min(1)
				.describe("Task UUID (e.g. tsk_…) or slug (e.g. fix-login-bug)."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.task.byIdOrSlug(input.idOrSlug);
		},
	});
}
