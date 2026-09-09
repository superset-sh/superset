import { table } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";
import { command } from "../../../../lib/command";

type Marketplace = RouterOutputs["plugins"]["marketplaces"]["list"][number];

export default command({
	description: "List the marketplaces on your account",
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "source"],
			["MARKETPLACE", "SOURCE"],
			[24, 60],
		),
	run: async ({ ctx }) => {
		const marketplaces = await ctx.api.plugins.marketplaces.list.query();

		const describe = (entry: Marketplace) => {
			if (entry.builtin) return "built in";
			if (entry.sourceKind === "path") return `path:${entry.path}`;
			return `github:${entry.repo}${entry.ref ? `#${entry.ref}` : ""}`;
		};

		return {
			data: marketplaces.map((entry) => ({
				name: entry.name,
				source: describe(entry),
				builtin: entry.builtin,
			})),
			message: `${marketplaces.length} marketplace${marketplaces.length === 1 ? "" : "s"}.`,
		};
	},
});
