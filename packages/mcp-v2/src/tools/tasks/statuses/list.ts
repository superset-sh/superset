import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../../caller";
import { defineTool } from "../../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_statuses_list",
		description:
			"List the available task statuses in the active organization. Use this to look up a status id by name (e.g. 'In Progress', 'Done') before creating or updating a task.",
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			const rows = await caller.task.statuses.list();
			return { statuses: rows };
		},
	});
}
