import { string, table } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveOrganizationFromContext } from "../../../lib/resolve-org";

export default command({
	description: "List hosts accessible to you in an organization",
	options: {
		org: string().desc("Organization (id, slug, or name); defaults to active"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "online", "id"],
			["NAME", "ONLINE", "ID"],
		),
	run: async ({ ctx, options }) => {
		const { id: organizationId } = await resolveOrganizationFromContext(
			ctx.api,
			ctx.config.organizationId,
			options.org,
		);

		const rows = await ctx.api.host.list.query({ organizationId });
		const localHostId = getHostId();
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			online: row.online ? "yes" : row.id === localHostId ? "local" : "no",
		}));
	},
});
