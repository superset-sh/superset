import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_close",
		annotations: { destructiveHint: true },
		description:
			"Close (dispose) a terminal by id — kills the PTY and the agent running in it. Use to shut down an agent session you started; targets the terminal by id (the value agents_create returned as `sessionId`).",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
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
			return hostServiceCall<{ terminalId: string; status: string }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.killSession",
				"mutation",
				{ terminalId: input.terminalId, workspaceId: input.workspaceId },
			);
		},
	});
}
