import { positional } from "@superset/cli-framework";
import { command } from "../../../../../lib/command";
import { resolveSource } from "../../../../../lib/plugins/organization-sources";

export default command({
	sandbox: false,
	description:
		"Stop syncing from a repository, and remove the plugins it brought",
	args: [positional("source").required().desc("Source id or owner/name")],
	run: async ({ ctx, args }) => {
		const source = await resolveSource(ctx.api, args.source as string);
		await ctx.api.plugins.organization.sources.remove.mutate({ id: source.id });
		return {
			data: { removed: source.id, repo: source.repo },
			message: `Removed ${source.repo} and its plugins.`,
		};
	},
});
