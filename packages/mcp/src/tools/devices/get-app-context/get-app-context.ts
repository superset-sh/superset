import { z } from "zod";
import { executeOnDevice, registerTool } from "../../utils";

export const register = registerTool(
	"get_app_context",
	{
		description:
			"Get the current app context including pathname and active workspace",
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
			tool: "get_app_context",
			params: {},
		});
	},
);
