import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveEnvironment } from "../../../lib/environments";

export default command({
	sandbox: false,
	description: "Rename an environment or change who can use it",
	args: [positional("environment").required().desc("Environment ID")],
	options: {
		name: string().desc("New name"),
		scope: string().enum("organization", "personal").desc("Who can use it"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		if (!options.name && !options.scope) {
			throw new CLIError("Nothing to change", "Pass --name or --scope");
		}
		const environment = await resolveEnvironment(
			ctx.api,
			organizationId,
			args.environment as string,
		);
		const updated = await ctx.api.environment.update.mutate({
			id: environment.id,
			name: options.name,
			scope: options.scope,
		});
		return {
			data: updated,
			message: `Updated ${updated?.name ?? environment.name}`,
		};
	},
});
