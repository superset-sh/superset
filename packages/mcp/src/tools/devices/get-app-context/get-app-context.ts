import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"get_app_context",
		{
			description:
				"Get the current app context on a device, including pathname and active workspace. The target device must belong to the current user.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;

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
}
