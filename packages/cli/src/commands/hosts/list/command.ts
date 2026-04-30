import { CLIError, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List hosts accessible to you in the active organization",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["id", "name", "online"],
			["ID", "NAME", "ONLINE"],
		),
	run: async ({ ctx }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const rows = await ctx.api.host.list.query({ organizationId });
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			online: row.online ? "yes" : "no",
		}));
	},
});
