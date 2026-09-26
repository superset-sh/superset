import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveEnvironment } from "../../../../lib/environments";

export default command({
	sandbox: false,
	description: "Delete a variable from an environment",
	args: [positional("name").required().desc("Variable name")],
	options: {
		environment: string().desc(
			"Environment (id or name); required when the organization has several",
		),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const environment = await resolveEnvironment(
			ctx.api,
			organizationId,
			options.environment,
		);
		const key = args.name as string;
		await ctx.api.environment.secrets.remove.mutate({
			environmentId: environment.id,
			key,
		});
		return {
			data: { environment: environment.name, key },
			message: `Deleted ${key} from ${environment.name}`,
		};
	},
});
