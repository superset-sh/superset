import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHost } from "../../../lib/host/resolve";
import { resolveOrganizationFromContext } from "../../../lib/resolve-org";

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
		org: string().desc("Organization (id, slug, or name); defaults to active"),
	},
	run: async ({ ctx, args, options }) => {
		const { id: organizationId } = await resolveOrganizationFromContext(
			ctx.api,
			ctx.config.organizationId,
			options.org,
		);

		const host = await resolveHost(
			ctx.api,
			organizationId,
			args.host as string,
		);

		const wakeCommand = ((args.command as string[] | undefined) ?? [])
			.join(" ")
			.trim();

		if (options.clear) {
			if (wakeCommand) {
				throw new CLIError("Pass either a command or --clear, not both");
			}
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
