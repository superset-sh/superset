import { boolean, CLIError, string } from "@superset/cli-framework";
import { tokenizeAgentCommand } from "@superset/shared/host-agent-presets";
import { parseEnvPairs } from "../../../../lib/agent-presets";
import { command } from "../../../../lib/command";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "Add an agent preset on a host",
	options: {
		label: string().required().desc("Display name shown in the agent picker"),
		command: string()
			.required()
			.desc(
				'Launch command, e.g. "claude --model claude-sonnet-4-6". Split on whitespace into the binary plus its args, the same way built-in presets are',
			),
		promptTransport: string()
			.enum("argv", "stdin")
			.default("argv")
			.desc("How the prompt reaches the agent"),
		promptArg: string()
			.variadic()
			.desc("Arg inserted before the prompt; repeat for several"),
		env: string()
			.variadic()
			.desc("Environment variable as KEY=VALUE; repeat for several"),
		presetId: string().desc(
			"Metadata tag used for icon and description lookup (default: custom)",
		),
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const [bin, ...args] = tokenizeAgentCommand(options.command);
		if (!bin) {
			throw new CLIError(
				"--command is empty",
				'Pass the launch command, e.g. --command "claude --dangerously-skip-permissions"',
			);
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const created = await target.client.settings.agentConfigs.add.mutate({
			label: options.label,
			command: bin,
			args,
			promptTransport: options.promptTransport,
			promptArgs: options.promptArg ?? [],
			env: parseEnvPairs(options.env ?? []),
			presetId: options.presetId ?? undefined,
		});

		return {
			data: created,
			message: `Added agent "${created.label}" (${created.id}). Launch it with: superset agents create --workspace <id> --agent ${created.id}`,
		};
	},
});
