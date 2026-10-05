import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../../define-tool";
import { hostServiceCall } from "../../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_presets_remove",
		annotations: { destructiveHint: true },
		description:
			"Delete a terminal-agent preset from a host, removing the row from Settings → Agents. Sessions already running are untouched; the agent can no longer be launched by this id. Fails if the id does not exist.",
		inputSchema: {
			hostId: z.string().min(1).describe("Host machineId the preset lives on."),
			id: z
				.string()
				.min(1)
				.describe(
					"Instance id of the preset to delete, as returned by `agents_list`.",
				),
		},
		handler: async (input, ctx) => {
			await hostServiceCall<{ success: true }>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"settings.agentConfigs.remove",
				"mutation",
				{ id: input.id },
			);
			// The host answers with a bare `{ success: true }`; echoing the id back
			// keeps the deleted row identifiable in the tool result.
			return { id: input.id, success: true as const };
		},
	});
}
