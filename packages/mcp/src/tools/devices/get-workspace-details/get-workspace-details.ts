import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"get_workspace_details",
		{
			description:
				"Get detailed information about a workspace on a device, including its tabs and panes. Use this to discover pane IDs needed for start_agent_session's paneId parameter. The target device must belong to the current user.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				workspaceId: z.string().describe("Workspace ID to get details for"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;
			const workspaceId = args.workspaceId as string;

			if (!deviceId || !workspaceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: deviceId and workspaceId are required",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "get_workspace_details",
				params: { workspaceId },
			});
		},
	);
}
