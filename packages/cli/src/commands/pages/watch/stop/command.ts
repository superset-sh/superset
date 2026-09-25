import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../../lib/command";
import { resolveHostTarget } from "../../../../lib/host-target";
import { resolvePageId } from "../../pageId";

export default command({
	description: "Stop watching a page for comments",
	options: {
		page: string().required().desc("Page id or slug"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const pageId = await resolvePageId(ctx, options.page);
		const target = await resolveHostTarget({
			requestedHostId: getHostId(),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		await target.client.pageWatch.unwatch.mutate({ pageId });

		return { data: { pageId }, message: `Stopped watching ${options.page}` };
	},
});
