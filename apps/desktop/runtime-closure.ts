import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	mainExternalizedDependencies,
	requiredMaterializedNodeModules,
	targetArch,
	targetPlatform,
} from "./runtime-dependencies";

export const runtimeDiskRequireSeeds = [
	...new Set([
		...requiredMaterializedNodeModules,
		...mainExternalizedDependencies,
	]),
];

function resolvePackageDir(name: string, fromDir: string): string | undefined {
	let dir = fromDir;
	while (true) {
		const candidate = join(dir, "node_modules", name);
		if (existsSync(join(candidate, "package.json")))
			return realpathSync(candidate);
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

function resolveSeed(name: string, baseDir: string): string | undefined {
	const direct = resolvePackageDir(name, baseDir);
	if (direct) return direct;
	let dir = existsSync(join(baseDir, "node_modules"))
		? dirname(realpathSync(join(baseDir, "node_modules")))
		: baseDir;
	while (true) {
		const candidate = join(dir, "node_modules/.bun/node_modules", name);
		if (existsSync(join(candidate, "package.json")))
			return realpathSync(candidate);
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

export function collectPackageNameClosure(
	seeds: string[],
	baseDir: string,
): Set<string> {
	const names = new Set<string>();
	const visited = new Set<string>();
	const queue = seeds.map((name) => ({
		name,
		dir: resolveSeed(name, baseDir),
	}));
	for (let index = 0; index < queue.length; index++) {
		const edge = queue[index];
		if (!edge?.dir) continue;
		names.add(edge.name);
		if (visited.has(edge.dir)) continue;
		visited.add(edge.dir);
		const manifest = JSON.parse(
			readFileSync(join(edge.dir, "package.json"), "utf8"),
		) as {
			dependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		for (const name of Object.keys({
			...manifest.dependencies,
			...manifest.optionalDependencies,
			...manifest.peerDependencies,
		})) {
			queue.push({ name, dir: resolvePackageDir(name, edge.dir) });
		}
	}
	return names;
}

export function computeRuntimeTailExclusions(
	appDir: string,
	seeds = runtimeDiskRequireSeeds,
): string[] {
	const manifest = JSON.parse(
		readFileSync(join(appDir, "package.json"), "utf8"),
	) as { dependencies?: Record<string, string> };
	const shipped = collectPackageNameClosure(
		Object.keys(manifest.dependencies ?? {}),
		appDir,
	);
	const keep = collectPackageNameClosure(seeds, appDir);
	for (const seed of seeds) {
		if (seed !== "pg-native" && !keep.has(seed))
			throw new Error(`Missing runtime dependency: ${seed}`);
	}
	return [...shipped]
		.filter(
			(name) =>
				!keep.has(name) ||
				((name.startsWith("@ast-grep/napi-") ||
					name.startsWith("@parcel/watcher-")) &&
					!name.startsWith(`@ast-grep/napi-${targetPlatform}-${targetArch}`) &&
					!name.startsWith(`@parcel/watcher-${targetPlatform}-${targetArch}`)),
		)
		.sort()
		.map((name) => `!**/node_modules/${name}/**`);
}
