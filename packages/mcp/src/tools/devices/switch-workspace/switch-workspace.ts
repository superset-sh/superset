import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"switch_workspace",
		{
			description: "Switch to a different workspace (git worktree)",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				workspaceId: z
					.string()
					.uuid()
					.optional()
					.describe("Workspace ID to switch to"),
				workspaceName: z
					.string()
					.optional()
					.describe("Workspace name to switch to"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;
			const workspaceId = args.workspaceId as string | undefined;
			const workspaceName = args.workspaceName as string | undefined;

			if (!deviceId) {
				return {
					content: [{ type: "text", text: "Error: deviceId is required" }],
					isError: true,
				};
			}

			if (!workspaceId && !workspaceName) {
				return {
					content: [
						{
							type: "text",
							text: "Error: Either workspaceId or workspaceName must be provided",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "switch_workspace",
				params: { workspaceId, workspaceName },
			});
		},
	);
}
