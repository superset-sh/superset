import fs from "node:fs";
import path from "node:path";
import { boolean, CLIError, positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	findMarketplace,
	resolvePlugins,
} from "../../../lib/plugins/marketplace";
import {
	checkPlugin,
	generatedManifestDrift,
} from "../../../lib/plugins/publish";

export default command({
	description:
		"Validate a plugin or a whole marketplace: manifest, release tag, and whether the built server matches its source",
	args: [
		positional("path").desc(
			"A plugin directory or a marketplace checkout (default: search upward from here)",
		),
	],
	options: {
		strict: boolean().desc(
			"Also require every plugin's current version to be released",
		),
	},
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "problem"],
			["PLUGIN", "PROBLEM"],
			[20, 80],
		),
	run: async ({ args, options }) => {
		const target = args.path as string | undefined;
		const from = target ? path.resolve(target) : undefined;
		if (from && !fs.existsSync(from)) {
			throw new CLIError(`No such path: ${from}`);
		}

		// Pointing at one plugin validates that plugin; the marketplace it belongs
		// to is whatever sits above it.
		const ctx = findMarketplace(from);
		const single =
			from && fs.existsSync(path.join(from, "plugin.json"))
				? ctx.marketplace.plugins.find(
						(entry) =>
							typeof entry.source === "string" &&
							path.resolve(ctx.root, entry.source) === from,
					)
				: undefined;
		if (from && fs.existsSync(path.join(from, "plugin.json")) && !single) {
			throw new CLIError(
				`${from} has a plugin.json but is not listed in ${ctx.file}.`,
			);
		}

		const plugins = resolvePlugins(ctx, single ? [single.name] : undefined);
		const strict = Boolean(options.strict);
		const issues = (
			await Promise.all(
				plugins.map((plugin) => checkPlugin(ctx, plugin, { strict })),
			)
		).flat();

		if (!single) issues.push(...generatedManifestDrift(ctx));

		if (issues.length) {
			throw new CLIError(
				`${issues.length} problem${issues.length === 1 ? "" : "s"} found:\n` +
					issues.map((i) => `  ${i.name}: ${i.problem}`).join("\n"),
			);
		}

		return {
			data: [],
			message: `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} valid.`,
		};
	},
});
