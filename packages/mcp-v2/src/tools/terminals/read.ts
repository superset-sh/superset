import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_read",
		description:
			"Read a terminal's current screen back as plain text — for a claude/codex agent this is the agent's rendered output, so use it to see the reply after terminals_send. Targets the terminal by id. Returns what is on screen now (plus recent scrollback), not a full transcript.",
		inputSchema: {
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
			const caller = createMcpCaller(ctx);
			const workspace = await caller.v2Workspace.getFromHost({
				organizationId: ctx.organizationId,
				id: input.workspaceId,
			});
			if (!workspace) {
				throw new Error(`Workspace not found: ${input.workspaceId}`);
			}

			return hostServiceCall<{
				terminalId: string;
				cols: number;
				rows: number;
				text: string;
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.snapshot",
				"query",
				{
					terminalId: input.terminalId,
					maxLines: input.maxLines,
				},
			);
		},
	});
}
