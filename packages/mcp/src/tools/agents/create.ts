import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_create",
		annotations: { destructiveHint: false },
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
			prompt: z
				.string()
				.optional()
				.describe(
					"Prompt sent to the agent. Required unless resumeSessionId is provided.",
				),
			model: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Model for this launch. Supported values depend on the agent; omit to use its default.",
				),
			effort: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Reasoning effort for this launch. Supported values depend on the agent; omit to use its default.",
				),
			resumeSessionId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"The agent CLI's own session id to restore instead of starting fresh (e.g. `claude --resume <id>`). NOT the `sessionId` this tool returns — that is a Superset terminal id. Use the id the agent reported (e.g. from the agent's own session list). Fails for agents without an id-based resume.",
				),
			attachmentIds: z
				.array(z.string().uuid())
				.optional()
				.describe(
					"Host-scoped attachment UUIDs. The host resolves these to absolute paths and appends them to the prompt.",
				),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<{
				kind: "terminal";
				sessionId: string;
				label: string;
			}>(
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
					model: input.model,
					effort: input.effort,
					resumeSessionId: input.resumeSessionId,
					attachmentIds: input.attachmentIds,
				},
			);
		},
	});
}
