import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"navigate_to_workspace",
		{
			description:
				"Open a workspace (git worktree) in the user's desktop app UI. This only changes what the user sees on screen — it does NOT change the agent's working directory, project context, or current workspace. Use switch_workspace to change the active workspace context.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				workspaceId: z
					.string()
					.optional()
					.describe("Workspace ID to open in the desktop app UI"),
				workspaceName: z
					.string()
					.optional()
					.describe("Workspace name to open in the desktop app UI"),
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
				tool: "navigate_to_workspace",
				params: { workspaceId, workspaceName },
			});
		},
	);
}
