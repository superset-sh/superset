import { number, string, table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description: "List members of the active organization",
	options: {
		search: string().alias("s").desc("Search by name or email"),
		limit: number().default(50).desc("Max results"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "email", "role", "id"],
			["NAME", "EMAIL", "ROLE", "ID"],
		),
	run: async ({ ctx, options }) => {
		return ctx.api.organization.members.list.query({
			search: options.search ?? undefined,
			limit: options.limit,
		});
	},
});
