import { z } from "zod";
import { executeOnDevice, registerTool } from "../../utils";

export const register = registerTool(
	"delete_workspace",
	{
		description: "Delete a workspace",
		inputSchema: {
			deviceId: z.string().describe("Target device ID"),
			workspaceId: z.string().uuid().describe("Workspace ID to delete"),
		},
	},
	async (params, ctx) => {
		const deviceId = params.deviceId as string;
		const workspaceId = params.workspaceId as string;

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
