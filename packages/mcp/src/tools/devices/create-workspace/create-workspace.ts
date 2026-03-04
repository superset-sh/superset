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
			description:
				"Create one or more workspaces (git worktrees) on a device. Use this when the user asks to create worktrees or workspaces.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				projectId: z.string().describe("Project ID to create workspaces in"),
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
			const projectId = args.projectId as string;
			const workspaces = args.workspaces as z.infer<
				typeof workspaceInputSchema
			>[];

			if (!deviceId || !projectId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: deviceId and projectId are required",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "create_workspace",
				params: { projectId, workspaces },
			});
		},
	);
}
