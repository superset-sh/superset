import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../../lib/command";
import { resolveHostTarget } from "../../../../lib/host-target";

export default command({
	description: "List the pages this host is watching for comments",
	options: {
		workspace: string().desc("Only show pages watched from this workspace id"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const target = await resolveHostTarget({
			requestedHostId: getHostId(),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const watched = await target.client.pageWatch.getAll.query(
			options.workspace ? { workspaceId: options.workspace } : undefined,
		);

		if (watched.length === 0) {
			return { data: watched, message: "No pages are being watched." };
		}

		return {
			data: watched,
			table: watched.map((w) => ({
				TITLE: w.title,
				SLUG: w.slug,
				AGENT: w.agentId ?? "—",
				TERMINAL: w.terminalId,
			})),
		};
	},
});
