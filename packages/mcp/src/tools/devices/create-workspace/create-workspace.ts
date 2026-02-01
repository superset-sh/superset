import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

const workspaceInputSchema = z.object({
	name: z
		.string()
		.optional()
		.describe("Workspace name (auto-generated if not provided)"),
	branchName: z
		.string()
		.optional()
		.describe("Branch name (auto-generated if not provided)"),
	baseBranch: z
		.string()
		.optional()
		.describe("Branch to create from (defaults to main)"),
});

export function register(server: McpServer) {
	server.registerTool(
		"create_workspace",
		{
			description: "Create one or more git worktree workspaces on a device",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				workspaces: z
					.array(workspaceInputSchema)
					.min(1)
					.max(5)
					.describe("Array of workspaces to create (1-5)"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;
			const workspaces = args.workspaces as z.infer<
				typeof workspaceInputSchema
			>[];

			if (!deviceId) {
				return {
					content: [{ type: "text", text: "Error: deviceId is required" }],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "create_workspace",
				params: { workspaces },
			});
		},
	);
}
