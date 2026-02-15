import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"list_projects",
		{
			description: "List all projects on a device",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const deviceId = args.deviceId as string;

			return executeOnDevice({
				ctx,
				deviceId,
				tool: "list_projects",
				params: {},
			});
		},
	);
}
