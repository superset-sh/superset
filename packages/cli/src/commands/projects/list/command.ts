import { CLIError, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List projects in the active organization",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["id", "name", "slug", "repoCloneUrl"],
			["ID", "NAME", "SLUG", "REPO"],
		),
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		return ctx.api.v2Project.list.query({ organizationId });
	},
});
