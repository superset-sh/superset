import { positional } from "@superset/cli-framework";
import { command } from "../../../../../lib/command";
import { resolveSource } from "../../../../../lib/plugins/organization-sources";

export default command({
	sandbox: false,
	description: "Sync a source now instead of waiting for the daily sync",
	args: [positional("source").required().desc("Source id or owner/name")],
	run: async ({ ctx, args }) => {
		const source = await resolveSource(ctx.api, args.source as string);
		await ctx.api.plugins.organization.sources.sync.mutate({ id: source.id });
		return {
			data: { id: source.id, repo: source.repo },
			message: `Sync of ${source.repo} requested.`,
		};
	},
});
