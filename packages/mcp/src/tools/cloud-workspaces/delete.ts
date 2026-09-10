import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "cloud_workspaces_delete",
		annotations: { destructiveHint: true },
		description:
			"Tear down a cloud sandbox and mark its row deleted. This is what stops it billing — nothing else does, including leaving it idle. Everything inside the sandbox is destroyed, so push or otherwise save any work first. Returns { deleted: false } when no such row exists.",
		inputSchema: {
			id: z.string().uuid().describe("Cloud workspace UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.cloudWorkspace.delete({ id: input.id });
		},
	});
}
