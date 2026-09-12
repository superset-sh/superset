import { positional, string, table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	installMarketplace,
	parseMarketplaceSource,
} from "../../../../lib/plugins/install";

export default command({
	description: "Add a marketplace from a GitHub repo or local path",
	args: [
		positional("source")
			.required()
			.desc("owner/repo, owner/repo@ref, a GitHub URL, or a local path"),
	],
	options: {
		name: string().desc("Register under this name instead of the manifest's"),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "plugins", "location"],
			["MARKETPLACE", "PLUGINS", "LOCATION"],
			[22, 10, 56],
		),
	run: async ({ ctx, args, options }) => {
		const source = parseMarketplaceSource(args.source as string);

		const local = await installMarketplace(source, {
			name: options.name as string | undefined,
		});

		await ctx.api.plugins.marketplaces.add.mutate(
			source.kind === "github"
				? {
						name: local.name,
						sourceKind: "github",
						repo: source.repo as string,
						ref: source.ref,
					}
				: {
						name: local.name,
						sourceKind: "path",
						path: source.path as string,
					},
		);

		return {
			data: [
				{
					name: local.name,
					plugins: local.plugins,
					location: local.location,
				},
			],
			message: `${local.updated ? "Updated" : "Added"} marketplace "${local.name}" with ${local.plugins} plugin${local.plugins === 1 ? "" : "s"}. Install one with: superset plugins install <name> --marketplace ${local.name}`,
		};
	},
});
