import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

const workspaceUpdateSchema = z.object({
	workspaceId: z.string().uuid().describe("Workspace ID to update"),
	name: z.string().min(1).describe("New workspace name"),
});

export function register(server: McpServer) {
	server.registerTool(
		"update_workspace",
		{
			description:
				"Update one or more workspaces (git worktrees) on a device. Currently supports renaming.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				updates: z
					.array(workspaceUpdateSchema)
					.min(1)
					.max(5)
					.describe("Array of workspace updates (1-5)"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;
			const updates = args.updates as z.infer<typeof workspaceUpdateSchema>[];

			if (!deviceId) {
				return {
					content: [{ type: "text", text: "Error: deviceId is required" }],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "update_workspace",
				params: { updates },
			});
		},
	);
}
