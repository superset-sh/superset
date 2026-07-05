import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "projects_list",
		description:
			"List projects in the active organization. A project is a checked-out repo. Use this to find a project's id before creating a workspace or scheduling an automation.",
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.v2Project.list({ organizationId: ctx.organizationId });
		},
	});
}
