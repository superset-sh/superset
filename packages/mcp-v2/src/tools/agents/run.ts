import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_run",
		description:
			"Launch an agent inside an existing workspace. Resolves the host that owns the workspace, then runs the named agent preset (or HostAgentConfig instance) with the given prompt. Terminal agents spawn a fresh PTY session; `superset` spawns a Superset session (mastracode runtime) instead. The result's `kind` field discriminates. Use this to start a second agent in a workspace that already exists; for create-and-spawn in a single call, pass `agents` to workspaces_create instead.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID to run the agent in."),
			agent: z
				.string()
				.min(1)
				.describe(
					"Agent preset id (e.g. `claude`, `codex`), HostAgentConfig instance UUID, or `superset` for a Superset session.",
				),
			prompt: z.string().min(1).describe("Prompt sent to the agent."),
			attachmentIds: z
				.array(z.string().uuid())
				.optional()
				.describe(
					"Host-scoped attachment UUIDs. For terminal agents the host appends a paths block to the prompt; for `superset` the host inlines the file bytes as base64 data URLs on the chat message.",
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

			return hostServiceCall<
				| { kind: "terminal"; sessionId: string; label: string }
				| { kind: "chat"; sessionId: string; label: string }
			>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"agents.run",
				"mutation",
				{
					workspaceId: input.workspaceId,
					agent: input.agent,
					prompt: input.prompt,
					attachmentIds: input.attachmentIds,
				},
			);
		},
	});
}
