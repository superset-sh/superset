import { z } from "zod";
import { executeOnDevice, registerTool } from "../../utils";

export const register = registerTool(
	"switch_workspace",
	{
		description: "Switch to a different workspace",
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
			tool: "switch_workspace",
			params: { workspaceId, workspaceName },
		});
	},
);
