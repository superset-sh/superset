#!/usr/bin/env bun
// Bump and re-publish every first-party plugin whose tree no longer matches
// its release tag (after `rebrand.py --plugins --write`). Runs the same code
// as `superset plugins publish <name> --bump patch`. It never creates or
// pushes tags: it prints the `git tag` commands for after the commit.
//
// Usage: bun republish-plugins.ts /path/to/repo

import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(process.argv[2] ?? ".");
process.chdir(repo);

const { bumpVersion, findMarketplace, resolvePlugins, writeJson } = await import(
	path.join(repo, "packages/cli/src/lib/plugins/marketplace.ts")
);
const { changedSinceTag, publishPlugin, tagExists, writeGeneratedManifests } =
	await import(path.join(repo, "packages/cli/src/lib/plugins/publish.ts"));

const ctx = findMarketplace();
const tags: string[] = [];

for (const plugin of resolvePlugins(ctx)) {
	const name = plugin.manifest.name as string;
	const current = `${name}@${plugin.manifest.version}`;
	if (!(await tagExists(ctx.root, current))) {
		console.log(`skip ${name}: ${current} is not tagged locally (fetch tags first)`);
		continue;
	}
	const changed = await changedSinceTag(
		ctx.root,
		current,
		path.relative(ctx.root, plugin.dir),
	);
	if (!changed?.length) continue;

	const next = bumpVersion(plugin.manifest.version, "patch");
	plugin.manifest.version = next;
	writeJson(path.join(plugin.dir, "plugin.json"), plugin.manifest);
	const pkgPath = path.join(plugin.dir, "package.json");
	if (fs.existsSync(pkgPath)) {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
		pkg.version = next;
		writeJson(pkgPath, pkg);
	}
	const result = await publishPlugin(ctx, plugin);
	tags.push(result.tag);
	console.log(`published ${name} ${plugin.manifest.version} (${changed.length} changed files)`);
}

writeGeneratedManifests(ctx);
console.log(
	tags.length
		? `\nAfter the commit lands on main:\n  git tag ${tags.join(" && git tag ")} && git push origin ${tags.join(" ")}`
		: "\nNo plugin changed.",
);
