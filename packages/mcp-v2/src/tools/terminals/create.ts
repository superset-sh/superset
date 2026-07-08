import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_create",
		description:
			"Create a terminal session in an existing workspace. Resolves the host that owns the workspace, then opens a fresh PTY in the worktree. Pass `command` to run a one-off shell command, or omit it to open an interactive shell. For create-and-run in a single call, pass `command` to workspaces_create instead.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID to create the terminal in."),
			command: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Shell command to run in the terminal. Omit to open an interactive shell.",
				),
			cwd: z
				.string()
				.optional()
				.describe(
					"Working directory for the terminal (defaults to the worktree).",
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

			return hostServiceCall<{ terminalId: string; status: string }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"terminal.createSession",
				"mutation",
				{
					workspaceId: input.workspaceId,
					initialCommand: input.command,
					cwd: input.cwd,
				},
			);
		},
	});
}
