import { expect, test } from "bun:test";
import {
	packagedNodeModuleCopies,
	requiredMaterializedNodeModules,
} from "./runtime-dependencies";

test("materializes the host service terminal disk dependency", () => {
	expect(requiredMaterializedNodeModules).toContain("@xterm/headless");
	expect(
		packagedNodeModuleCopies.some(
			(copy) => copy.to === "node_modules/@xterm/headless",
		),
	).toBe(true);
});

import { createRequire } from "node:module";
import { targetArch, targetPlatform } from "./runtime-dependencies";

const requireBuilder = createRequire(require.resolve("electron-builder"));
const { FileMatcher } = requireBuilder("app-builder-lib/out/fileMatcher");
test("keeps target native binaries and rejects foreign payloads in separate file sets", () => {
	const copy = packagedNodeModuleCopies.find(
		(copy) => copy.from === "node_modules/@ast-grep",
	);
	if (!copy) throw new Error("Missing native copy");
	const filter = new FileMatcher(
		"/owned",
		"/destination",
		(pattern: string) => pattern,
		copy.filter,
	).createFilter();
	const stat = { isDirectory: () => false };
	expect(
		filter(`/owned/napi-${targetPlatform}-${targetArch}/ast-grep.node`, stat),
	).toBe(true);
	expect(filter("/owned/napi-foreign-arm64/ast-grep.node", stat)).toBe(false);
	expect(filter("/owned/napi/index.js", stat)).toBe(true);
	expect(filter("/owned/napi/index.js.map", stat)).toBe(false);
});

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeHelperPackages } from "./runtime-dependencies";

test("materializes every installed helper dependency needed by explicit package copies", () => {
	const missing = new Set<string>();
	const queue = [...runtimeHelperPackages];
	const visited = new Set<string>();
	for (let index = 0; index < queue.length; index++) {
		const name = queue[index];
		if (!name || visited.has(name)) continue;
		visited.add(name);
		const materialized = join(
			import.meta.dir,
			"node_modules",
			name,
			"package.json",
		);
		const path = existsSync(materialized)
			? materialized
			: join(
					import.meta.dir,
					"../../node_modules/.bun/node_modules",
					name,
					"package.json",
				);
		const manifest = JSON.parse(readFileSync(path, "utf8")) as {
			dependencies?: Record<string, string>;
		};
		for (const dependency of Object.keys(manifest.dependencies ?? {})) {
			if (
				!requiredMaterializedNodeModules.includes(dependency) ||
				!packagedNodeModuleCopies.some(
					(copy) => copy.to === `node_modules/${dependency}`,
				)
			)
				missing.add(dependency);
			queue.push(dependency);
		}
	}
	expect([...missing].sort()).toEqual([]);
});
