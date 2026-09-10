import { boolean, positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { buildPlugin } from "../../../lib/plugins/build";
import {
	findMarketplace,
	resolvePlugins,
} from "../../../lib/plugins/marketplace";

export default command({
	description: "Build plugin servers from TypeScript source",
	args: [
		positional("names")
			.variadic()
			.desc("Plugin names to build (default: every plugin in the marketplace)"),
	],
	options: {
		force: boolean().desc("Rebuild even when the existing build is current"),
	},
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "status", "size"],
			["PLUGIN", "STATUS", "SIZE"],
			[24, 16, 12],
		),
	run: async ({ args, options }) => {
		const ctx = findMarketplace();
		const plugins = resolvePlugins(ctx, args.names as string[] | undefined);
		const results = [];
		for (const plugin of plugins) {
			results.push(
				await buildPlugin(plugin, { force: options.force as boolean }),
			);
		}

		const data = results.map((result) => ({
			name: result.name,
			status: result.built ? "built" : (result.reason ?? "skipped"),
			size: result.bytes ? `${(result.bytes / 1024).toFixed(0)} KB` : "-",
		}));
		const built = results.filter((r) => r.built).length;

		return {
			data,
			message: built
				? `Built ${built} of ${results.length} plugin${results.length === 1 ? "" : "s"}.`
				: "Nothing to build; every server is up to date.",
		};
	},
});
