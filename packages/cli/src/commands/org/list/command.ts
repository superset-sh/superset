import { command, table } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export default command({
	description: "List organizations you belong to",

	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "slug", "active"],
			["NAME", "SLUG", "ACTIVE"],
		),

	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const orgs = await api.user.myOrganizations.query();
		const me = await api.user.myOrganization.query();
		const activeId = me?.id;

		return orgs.map((org) => ({
			id: org.id,
			name: org.name,
			slug: org.slug,
			active: org.id === activeId ? "✓" : "",
		}));
	},
});
