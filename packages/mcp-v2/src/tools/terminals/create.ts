import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_create",
		description:
			"Create a terminal session in an existing workspace on its host: opens a fresh PTY in the worktree. Use hosts_list / workspaces_list to find the hostId. Pass `command` to run a one-off shell command, or omit it to open an interactive shell. For create-and-run in a single call, pass `command` to workspaces_create instead.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
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
			return hostServiceCall<{ terminalId: string; status: string }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
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
