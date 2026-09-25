import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import {
	workspaceLocationInput,
	workspaceServiceCall,
} from "../../workspace-service-target";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_close",
		annotations: { destructiveHint: true },
		description:
			"Close (dispose) a terminal by id — kills the PTY and the agent running in it. Use to shut down an agent session you started; targets the terminal by id (the value agents_create returned as `sessionId`).",
		inputSchema: {
			...workspaceLocationInput,
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID the terminal runs in."),
			terminalId: z
				.string()
				.describe(
					"Terminal id (the `sessionId` agents_create returned, or `terminalId` from terminals_create).",
				),
		},
		handler: async (input, ctx) => {
			return workspaceServiceCall<{ terminalId: string; status: string }>(
				input,
				ctx,
				"terminal.killSession",
				"mutation",
				{ terminalId: input.terminalId, workspaceId: input.workspaceId },
			);
		},
	});
}
