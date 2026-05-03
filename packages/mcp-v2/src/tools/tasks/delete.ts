import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_delete",
		description:
			"Delete a task by UUID. This is a hard delete and cannot be undone.",
		inputSchema: {
			id: z.string().uuid().describe("Task UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.task.delete(input.id);
		},
	});
}
