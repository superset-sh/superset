import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"delete_workspace",
		{
			description: "Delete a workspace",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				workspaceId: z.string().uuid().describe("Workspace ID to delete"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;
			const workspaceId = args.workspaceId as string;

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
				params: { workspaceId },
			});
		},
	);
}
