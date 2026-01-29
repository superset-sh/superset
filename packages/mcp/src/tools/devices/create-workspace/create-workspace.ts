import { z } from "zod";
import { executeOnDevice, registerTool } from "../../utils";

export const register = registerTool(
	"create_workspace",
	{
		description: "Create a new git worktree workspace",
		inputSchema: {
			deviceId: z.string().describe("Target device ID"),
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
			taskId: z
				.string()
				.optional()
				.describe("Task ID to associate with workspace"),
		},
	},
	async (params, ctx) => {
		const deviceId = params.deviceId as string;

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
			params: {
				name: params.name,
				branchName: params.branchName,
				baseBranch: params.baseBranch,
				taskId: params.taskId,
			},
		});
	},
);
