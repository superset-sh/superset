import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { tokenizeAgentCommand } from "@superset/shared/host-agent-presets";
import { parseEnvPairs } from "../../../../lib/agent-presets";
import { command } from "../../../../lib/command";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "Edit an agent preset on a host",
	args: [
		positional("id")
			.required()
			.desc("Agent config id from `superset agents list`"),
	],
	options: {
		label: string().desc("New display name"),
		command: string().desc(
			"New launch command; replaces both the binary and its args",
		),
		promptTransport: string()
			.enum("argv", "stdin")
			.desc("How the prompt reaches the agent"),
		promptArg: string()
			.variadic()
			.desc("Replace the prompt args; repeat for several"),
		env: string()
			.variadic()
			.desc(
				"Replace the environment with these KEY=VALUE pairs; repeat for several",
			),
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		// Every field replaces rather than merges, so `--command` has to carry
		// its args along: patching the binary alone would leave the old flags
		// bolted onto a different program.
		const patch: {
			label?: string;
			command?: string;
			args?: string[];
			promptTransport?: "argv" | "stdin";
			promptArgs?: string[];
			env?: Record<string, string>;
		} = {};
		if (options.label !== undefined) patch.label = options.label;
		if (options.command !== undefined) {
			const [bin, ...commandArgs] = tokenizeAgentCommand(options.command);
			if (!bin) {
				throw new CLIError(
					"--command is empty",
					'Pass the launch command, e.g. --command "claude --dangerously-skip-permissions"',
				);
			}
			patch.command = bin;
			patch.args = commandArgs;
		}
		if (options.promptTransport !== undefined)
			patch.promptTransport = options.promptTransport;
		if (options.promptArg !== undefined) patch.promptArgs = options.promptArg;
		if (options.env !== undefined) patch.env = parseEnvPairs(options.env);

		if (Object.keys(patch).length === 0) {
			throw new CLIError(
				"Nothing to update",
				"Pass at least one of --label, --command, --prompt-transport, --prompt-arg, --env",
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

		const updated = await target.client.settings.agentConfigs.update.mutate({
			id,
			patch,
		});

		return {
			data: updated,
			message: `Updated agent "${updated.label}" (${updated.id})`,
		};
	},
});
