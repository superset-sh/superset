import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../../define-tool";
import { hostServiceCall } from "../../../host-service-client";
import { resolveLaunch } from "./launch-input";
import type { HostAgentConfig } from "./types";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "agents_presets_add",
		annotations: { destructiveHint: false },
		description:
			"Add a terminal-agent preset to a host — a new row in Settings → Agents on that machine, launchable afterwards by `agents_create` or `workspaces_create`. Describe the launch either structurally (`command` plus `args`) or as a single `launchCommand` line; passing both is an error. Returns the created config, including the instance id to pass to `agents_presets_edit` or `agents_presets_remove`.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe(
					"Host machineId to add the preset on. See `hosts_list` to enumerate accessible hosts.",
				),
			label: z
				.string()
				.min(1)
				.describe("Display name shown in Settings → Agents and agent pickers."),
			command: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Binary to run, without arguments (e.g. `claude`). Pair with `args`. Mutually exclusive with `launchCommand`; one of the two is required.",
				),
			args: z
				.array(z.string())
				.optional()
				.describe(
					"Arguments always passed to the binary, before any prompt args. Only valid alongside `command`; defaults to none.",
				),
			launchCommand: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Full launch line split on whitespace into binary and args (e.g. `codex --full-auto`). There is no quoting — an argument containing a space has to go through `command` + `args`. Mutually exclusive with `command`/`args`.",
				),
			promptTransport: z
				.enum(["argv", "stdin"])
				.default("argv")
				.describe(
					"How the prompt reaches the agent: `argv` appends it as a final argument, `stdin` pipes it.",
				),
			promptArgs: z
				.array(z.string())
				.default([])
				.describe(
					'Extra arguments spliced in when a prompt is present (e.g. `["-p"]`).',
				),
			env: z
				.record(z.string(), z.string())
				.default({})
				.describe("Environment variables set for the agent process."),
			presetId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Metadata tag identifying which built-in preset this row came from, used for the description and icon fallback. Defaults to `custom`. Duplicates are allowed — every row gets its own id.",
				),
		},
		handler: async (input, ctx) => {
			const launch = resolveLaunch(input);
			if (!launch) {
				throw new Error(
					"Provide command (the binary, with optional args) or launchCommand (a full launch line).",
				);
			}
			return hostServiceCall<HostAgentConfig>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"settings.agentConfigs.add",
				"mutation",
				{
					label: input.label,
					command: launch.command,
					args: launch.args,
					promptTransport: input.promptTransport,
					promptArgs: input.promptArgs,
					env: input.env,
					presetId: input.presetId,
				},
			);
		},
	});
}
