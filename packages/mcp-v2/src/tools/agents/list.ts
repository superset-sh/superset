import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

interface HostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
	order: number;
}

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_list",
		description:
			"List terminal-agent instances configured on a host (the rows in Settings → Agents on that machine). Returns each row with its instance UUID, presetId, label, command, args, and env. Use to find an `agent` value for `agents_run` or to confirm what's installed before launching.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe(
					"Host machineId to query. See `hosts_list` to enumerate accessible hosts.",
				),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<HostAgentConfig[]>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"settings.agentConfigs.list",
				"query",
			);
		},
	});
}
