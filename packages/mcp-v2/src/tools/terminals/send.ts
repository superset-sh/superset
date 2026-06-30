import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_send",
		description:
			"Send text to a terminal ALREADY running in a workspace — e.g. a follow-up to a claude/codex agent — instead of spawning a new session. Targets the terminal by id (the value agents_create returned as `sessionId`, or terminals_create returned as `terminalId`). Use agents_create only to START an agent; use this for every message after. Multi-line text is delivered as a single paste, not separate submits.",
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
			text: z.string().min(1).describe("Text to write into the terminal."),
			submit: z
				.boolean()
				.optional()
				.describe("Press Enter after the text. Default true."),
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

			return hostServiceCall<{ terminalId: string; submitted: boolean }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.send",
				"mutation",
				{
					terminalId: input.terminalId,
					text: input.text,
					submit: input.submit ?? true,
				},
			);
		},
	});
}
