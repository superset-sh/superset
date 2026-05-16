/**
 * Walks a package and its runtime dependency graph to determine which
 * packages need to be shipped alongside the host-service bundle. Because
 * native addon packages are externalized at bundle time (their `.node`
 * files can't be inlined), Node's ESM resolver looks them up from
 * lib/node_modules/ at runtime — and once it loads such a package, that
 * package's own `import` statements must also resolve from disk.
 *
 * This means we have to ship not just the externalized package's direct
 * dependencies but also any **peer dependencies** that the package
 * actually imports. The original walker only followed `dependencies`,
 * which caused `@mastra/duckdb` to ship without `@mastra/core` (a peer
 * dep) and crash the host-service on startup with ERR_MODULE_NOT_FOUND.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export type ResolvedPackage = {
	name: string;
	sourcePath: string;
};

export function findPackagePath(
	packageName: string,
	startDir: string,
	repoRoot: string,
): string | null {
	let current = startDir;
	while (current.startsWith(repoRoot)) {
		const candidate = join(current, "node_modules", packageName);
		if (existsSync(candidate)) return realpathSync(candidate);
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const fallbacks = [
		join(repoRoot, "packages", "host-service", "node_modules", packageName),
		join(repoRoot, "packages", "workspace-fs", "node_modules", packageName),
		join(repoRoot, "node_modules", packageName),
	];
	for (const fallback of fallbacks) {
		if (existsSync(fallback)) return realpathSync(fallback);
	}
	const bunStore = join(repoRoot, "node_modules", ".bun");
	if (existsSync(bunStore)) {
		const encoded = packageName.replace("/", "+");
		const prefix = `${encoded}@`;
		const matches = readdirSync(bunStore)
			.filter((entry) => entry.startsWith(prefix))
			.map((entry) => join(bunStore, entry, "node_modules", packageName))
			.filter((candidate) => existsSync(candidate));
		if (matches.length === 1) return realpathSync(matches[0] as string);
		if (matches.length > 1) {
			throw new Error(
				`Ambiguous Bun store matches for ${packageName}: ${matches.join(", ")}`,
			);
		}
	}
	return null;
}

/**
 * Recursively resolve `seeds` plus their full runtime dependency graph.
 * Walks both `dependencies` and `peerDependencies` of every package
 * encountered. Peer dependencies that cannot be resolved from disk are
 * skipped silently — optional peers are common and not always installed.
 *
 * Returns a deduplicated list of packages with their resolved source
 * paths, in insertion order.
 */
export function collectRuntimePackages(
	seeds: readonly string[],
	startDir: string,
	repoRoot: string,
): ResolvedPackage[] {
	const collected = new Map<string, string>();

	const visit = (
		name: string,
		currentStartDir: string,
		isPeer: boolean,
	): void => {
		if (collected.has(name)) return;
		const sourcePath = findPackagePath(name, currentStartDir, repoRoot);
		if (!sourcePath) {
			if (isPeer) return;
			throw new Error(`Package not found: ${name}. Run 'bun install' first.`);
		}
		collected.set(name, sourcePath);

		const packageJsonPath = join(sourcePath, "package.json");
		if (!existsSync(packageJsonPath)) return;
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		for (const dep of Object.keys(pkg.dependencies ?? {})) {
			visit(dep, sourcePath, false);
		}
		for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
			visit(peer, sourcePath, true);
		}
	};

	for (const seed of seeds) {
		visit(seed, startDir, false);
	}
	return Array.from(collected.entries()).map(([name, sourcePath]) => ({
		name,
		sourcePath,
	}));
}
