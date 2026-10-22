import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../../lib/command";

export default command({
	sandbox: false,
	description:
		"Sync your organization's plugins from a GitHub repository the Superset GitHub App is installed on",
	args: [positional("repo").required().desc("owner/name")],
	options: {
		ref: string().desc(
			"Branch, tag or commit to sync. Default: the default branch",
		),
		path: string().desc("Directory of the marketplace file, if not the root"),
	},
	run: async ({ ctx, args, options }) => {
		const source = await ctx.api.plugins.organization.sources.add.mutate({
			repo: args.repo as string,
			ref: options.ref as string | undefined,
			path: options.path as string | undefined,
		});
		return {
			data: source,
			message: `Added ${source.repo}. It syncs daily; see what it brought: superset plugins organization list`,
		};
	},
});
