import { boolean, CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHost } from "../../../lib/host/resolve";

export default command({
	description: "Set (or clear) the command used to wake a host",
	args: [
		positional("host").required().desc("Host name or id"),
		positional("command")
			.variadic()
			.desc(
				'Command to run to wake the host, e.g. "vercel sandbox resume my-box"',
			),
	],
	options: {
		clear: boolean().desc("Remove the wake command"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const host = await resolveHost(
			ctx.api,
			organizationId,
			args.host as string,
		);

		if (options.clear) {
			await ctx.api.host.setWakeCommand.mutate({
				organizationId,
				machineId: host.id,
				wakeCommand: null,
			});
			return {
				data: { host: host.name, wakeCommand: null },
				message: `Cleared wake command for ${host.name}`,
			};
		}

		const wakeCommand = ((args.command as string[] | undefined) ?? [])
			.join(" ")
			.trim();
		if (!wakeCommand) {
			throw new CLIError(
				"Provide a command to run, or pass --clear to remove it",
			);
		}

		await ctx.api.host.setWakeCommand.mutate({
			organizationId,
			machineId: host.id,
			wakeCommand,
		});
		return {
			data: { host: host.name, wakeCommand },
			message: `Set wake command for ${host.name}`,
		};
	},
});
