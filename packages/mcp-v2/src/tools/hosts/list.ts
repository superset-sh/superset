import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "hosts_list",
		description:
			"List the hosts (registered machines) the calling user has access to in the active organization. Use this to find a host's id before creating a workspace or scheduling an automation.",
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.host.list({ organizationId: ctx.organizationId });
		},
	});
}
