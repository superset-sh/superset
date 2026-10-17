import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../../define-tool";
import { hostServiceCall } from "../../../host-service-client";
import { resolveLaunch } from "./launch-input";
import type { HostAgentConfig } from "./types";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_presets_edit",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Edit a terminal-agent preset on a host. Every field replaces rather than merges: `promptArgs` and `env` overwrite the stored set whole, and `command` and `args` always move together. Omitted fields are left alone, but at least one is required. `presetId` and display order are not editable. Returns the updated config.",
		inputSchema: {
			hostId: z.string().min(1).describe("Host machineId the preset lives on."),
			id: z
				.string()
				.min(1)
				.describe(
					"Instance id of the preset to edit, as returned by `agents_list` or `agents_presets_add`.",
				),
			label: z.string().min(1).optional().describe("New display name."),
			command: z
				.string()
				.min(1)
				.optional()
				.describe(
					"New binary, without arguments. Replaces `args` too — pass them together, or the stored args are cleared. Mutually exclusive with `launchCommand`.",
				),
			args: z
				.array(z.string())
				.optional()
				.describe(
					"New argument list, replacing the stored one. Only valid alongside `command`.",
				),
			launchCommand: z
				.string()
				.min(1)
				.optional()
				.describe(
					"New launch line, split on whitespace into binary and args. Mutually exclusive with `command`/`args`.",
				),
			promptTransport: z
				.enum(["argv", "stdin"])
				.optional()
				.describe(
					"How the prompt reaches the agent: `argv` appends it as a final argument, `stdin` pipes it.",
				),
			promptArgs: z
				.array(z.string())
				.optional()
				.describe(
					"New prompt arguments, replacing the stored set. Pass `[]` to clear.",
				),
			env: z
				.record(z.string(), z.string())
				.optional()
				.describe(
					"New environment map, replacing the stored one whole. Pass `{}` to clear.",
				),
		},
		handler: async (input, ctx) => {
			const launch = resolveLaunch(input);
			const patch: Record<string, unknown> = {};
			if (input.label !== undefined) patch.label = input.label;
			if (launch) {
				patch.command = launch.command;
				patch.args = launch.args;
			}
			if (input.promptTransport !== undefined)
				patch.promptTransport = input.promptTransport;
			if (input.promptArgs !== undefined) patch.promptArgs = input.promptArgs;
			if (input.env !== undefined) patch.env = input.env;
			if (Object.keys(patch).length === 0) {
				throw new Error("Nothing to update");
			}
			return hostServiceCall<HostAgentConfig>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"settings.agentConfigs.update",
				"mutation",
				{ id: input.id, patch },
			);
		},
	});
}
