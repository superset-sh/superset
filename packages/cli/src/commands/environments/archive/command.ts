import { boolean, CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { confirmByName, resolveEnvironment } from "../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Archive an environment; its snapshot is deleted and no new workspace can start from it",
	args: [positional("environment").required().desc("Environment ID")],
	options: {
		yes: boolean().desc("Archive without asking; required without a terminal"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const environment = await resolveEnvironment(
			ctx.api,
			organizationId,
			args.environment as string,
		);
		await confirmByName({
			name: environment.name,
			consequence: `Archiving ${environment.name} deletes its snapshot and cannot be undone`,
			yes: options.yes,
			rerun: `superset environments archive ${environment.id}`,
		});
		await ctx.api.environment.archive.mutate({ id: environment.id });
		return {
			data: { id: environment.id, name: environment.name, archived: true },
			message: `Archived ${environment.name}`,
		};
	},
});
