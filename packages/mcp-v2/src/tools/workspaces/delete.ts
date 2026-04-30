import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_delete",
		description:
			"Delete a workspace by UUID. Idempotent — succeeds if the workspace is already gone. Cannot delete 'main'-type workspaces.",
		inputSchema: {
			id: z.string().uuid().describe("Workspace UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.v2Workspace.delete({ id: input.id });
		},
	});
}
