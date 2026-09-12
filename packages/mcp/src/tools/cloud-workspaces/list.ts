import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "cloud_workspaces_list",
		annotations: { readOnlyHint: true },
		description:
			"List the organization's cloud sandboxes with their provisioning status ('provisioning', 'ready', 'failed'). Use it to find a sandbox id, and to watch one created by cloud_workspaces_create reach 'ready'. These are not host workspaces — workspaces_list will not show them.",
		inputSchema: {},
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.cloudWorkspace.list({
				organizationId: ctx.organizationId,
			});
		},
	});
}
