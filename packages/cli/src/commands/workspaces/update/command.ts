import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Update a workspace",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		name: string().desc("Workspace name"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.name === undefined) {
			throw new CLIError("No fields to update", "Pass --name <new-name>");
		}

		const updated = await ctx.api.v2Workspace.update.mutate({
			id,
			name: options.name,
		});

		return {
			data: updated,
			message: `Updated workspace ${id}`,
		};
	},
});
