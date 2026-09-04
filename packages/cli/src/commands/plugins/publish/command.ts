import fs from "node:fs";
import path from "node:path";
import {
	boolean,
	CLIError,
	positional,
	string,
	table,
} from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	bumpVersion,
	findMarketplace,
	resolvePlugins,
	writeJson,
} from "../../../lib/plugins/marketplace";
import {
	publishPlugin,
	writeGeneratedManifests,
} from "../../../lib/plugins/publish";

const LEVELS = new Set(["major", "minor", "patch"]);

export default command({
	description:
		"Cut a version of a plugin: build, record it in the marketplace and the generated bundle, and name the tag to publish it at",
	args: [
		positional("names")
			.variadic()
			.desc(
				"Plugin names to publish (default: every plugin in the marketplace)",
			),
	],
	options: {
		bump: string().desc(
			"Bump the version before publishing: major, minor, or patch",
		),
		force: boolean().desc("Overwrite an already-published version"),
	},
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "files", "tag"],
			["PLUGIN", "VERSION", "FILES", "TAG"],
			[20, 12, 8, 44],
		),
	run: async ({ args, options }) => {
		const bump = options.bump as string | undefined;
		if (bump && !LEVELS.has(bump)) {
			throw new CLIError(
				`--bump must be major, minor, or patch (got "${bump}").`,
			);
		}

		const ctx = findMarketplace();
		const plugins = resolvePlugins(ctx, args.names as string[] | undefined);

		if (bump) {
			for (const plugin of plugins) {
				const next = bumpVersion(plugin.manifest.version, bump as "patch");
				plugin.manifest.version = next;
				writeJson(path.join(plugin.dir, "plugin.json"), plugin.manifest);

				const pkgPath = path.join(plugin.dir, "package.json");
				if (fs.existsSync(pkgPath)) {
					const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
					pkg.version = next;
					writeJson(pkgPath, pkg);
				}
			}
		}

		const results = [];
		for (const plugin of plugins) {
			results.push(
				await publishPlugin(ctx, plugin, { force: options.force as boolean }),
			);
		}

		writeGeneratedManifests(ctx);

		return {
			data: results.map((r) => ({
				name: r.name,
				version: r.version,
				files: r.files,
				tag: r.tag,
			})),
			message: `Published ${results.map((r) => `${r.name}@${r.version}`).join(", ")}. Commit, then tag: ${results.map((r) => `git tag ${r.tag}`).join(" && ")}`,
		};
	},
});
