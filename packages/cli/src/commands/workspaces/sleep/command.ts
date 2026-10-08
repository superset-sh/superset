import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Put a cloud workspace to sleep: its sandbox stops and costs storage only, and opening it wakes it. Inside a cloud workspace it defaults to that workspace",
	args: [
		positional("id").desc(
			"Cloud workspace ID (default: the cloud workspace this runs in)",
		),
	],
	run: async ({ ctx, args }) => {
		const id =
			(args.id as string | undefined) ??
			process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
		if (!id) {
			throw new CLIError(
				"No cloud workspace",
				"Pass an id, or run this inside a cloud workspace",
			);
		}
		const { stopped } = await ctx.api.cloudWorkspace.sleep.mutate({ id });
		return {
			data: { id, stopped },
			message: stopped
				? `Cloud workspace ${id} is asleep`
				: `Cloud workspace ${id} was already asleep`,
		};
	},
});
