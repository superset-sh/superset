import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_read",
		annotations: { readOnlyHint: true },
		description:
			"Read a terminal's current screen back as plain text — for a claude/codex agent this is the agent's rendered output, so use it to see the reply after terminals_send. Returns what is on screen now (plus recent scrollback), not a full transcript.",
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
			maxLines: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Cap returned rows from the bottom. Omit for the full snapshot.",
				),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<{
				terminalId: string;
				cols: number;
				rows: number;
				text: string;
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.snapshot",
				"query",
				{
					terminalId: input.terminalId,
					workspaceId: input.workspaceId,
					maxLines: input.maxLines,
				},
			);
		},
	});
}
