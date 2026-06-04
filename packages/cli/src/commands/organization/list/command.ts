import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List organizations you belong to",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "slug", "active"],
			["NAME", "SLUG", "ACTIVE"],
		),
	run: async ({ ctx }) => {
		const organizations = await ctx.api.user.myOrganizations.query();
		const current = await ctx.api.user.myOrganization.query();
		const activeId = current?.id;

		return organizations.map((organization) => ({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			active: organization.id === activeId ? "✓" : "",
		}));
	},
});
