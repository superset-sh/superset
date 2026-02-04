import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"delete_workspace",
		{
			description: "Delete one or more workspaces (git worktrees) on a device",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				workspaceIds: z
					.array(z.string().uuid())
					.min(1)
					.max(5)
					.describe("Array of workspace IDs to delete (1-5)"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;
			const workspaceIds = args.workspaceIds as string[];

			if (!deviceId) {
				return {
					content: [{ type: "text", text: "Error: deviceId is required" }],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "delete_workspace",
				params: { workspaceIds },
			});
		},
	);
}
