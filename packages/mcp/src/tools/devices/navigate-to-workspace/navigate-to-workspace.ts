import { z } from "zod";
import { executeOnDevice, registerTool } from "../../utils";

export const register = registerTool(
	"navigate_to_workspace",
	{
		description: "Navigate the desktop app to a specific workspace",
		inputSchema: {
			deviceId: z.string().describe("Target device ID"),
			workspaceId: z
				.string()
				.optional()
				.describe("Workspace ID to navigate to"),
			workspaceName: z
				.string()
				.optional()
				.describe("Workspace name to navigate to"),
		},
	},
	async (params, ctx) => {
		const deviceId = params.deviceId as string;
		const workspaceId = params.workspaceId as string | undefined;
		const workspaceName = params.workspaceName as string | undefined;

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
