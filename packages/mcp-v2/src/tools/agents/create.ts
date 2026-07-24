import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_create",
		description:
			"Create (launch) an agent session inside an existing workspace on its host: runs the named agent preset (or HostAgentConfig instance) with the given prompt in a fresh terminal session. Use hosts_list / workspaces_list to find the hostId. Use this to start a second agent in a workspace that already exists; for create-and-spawn in a single call, pass `agents` to workspaces_create instead.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID to run the agent in."),
			agent: z
				.string()
				.min(1)
				.describe(
					"Agent preset id (e.g. `claude`, `codex`, `superset`) or HostAgentConfig instance UUID.",
				),
			prompt: z.string().min(1).describe("Prompt sent to the agent."),
			attachmentIds: z
				.array(z.string().uuid())
				.optional()
				.describe(
					"Host-scoped attachment UUIDs. The host resolves these to absolute paths and appends them to the prompt.",
				),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<
				| { kind: "terminal"; sessionId: string; label: string }
				| { kind: "chat"; sessionId: string; label: string }
			>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
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
