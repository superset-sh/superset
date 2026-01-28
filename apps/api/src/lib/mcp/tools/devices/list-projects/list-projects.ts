import { z } from "zod";
import { executeOnDevice, registerTool } from "../../utils";

export const register = registerTool(
	"list_projects",
	{
		description: "List all projects on a device",
		inputSchema: {
			deviceId: z.string().describe("Target device ID"),
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
			tool: "list_projects",
			params: {},
		});
	},
);
