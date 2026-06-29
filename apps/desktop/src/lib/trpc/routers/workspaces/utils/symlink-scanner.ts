import { promises as fs } from "node:fs";
import path from "node:path";
import type { LinkedTarget } from "shared/linked-worktrees-types";

const DEP_DIRS = new Set(["node_modules", "vendor"]);
const PRUNE = new Set([
	".git",
	"dist",
	"build",
	".next",
	"target",
	"out",
	"coverage",
]);
const DEFAULT_MAX_DEPTH = 4;
/** Cap on in-flight fs operations so large dep trees can't exhaust file descriptors. */
const DEFAULT_CONCURRENCY = 32;

/**
 * Minimal promise concurrency limiter — keeps at most `max` thunks running at
 * once and queues the rest. Used to bound readdir/lstat/realpath fan-out.
 */
function createLimiter(max: number) {
	let active = 0;
	const queue: Array<() => void> = [];
	const pump = () => {
		if (active >= max || queue.length === 0) return;
		active++;
		const run = queue.shift();
		run?.();
	};
	return function limit<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			queue.push(() => {
				fn()
					.then(resolve, reject)
					.finally(() => {
						active--;
						pump();
					});
			});
			pump();
		});
	};
}

export interface WorktreeIndexEntry {
	/** Absolute worktree root path. */
	path: string;
	/** Branch / worktree name, shown after the "~". */
	label: string;
	/** Present => tracked by superset. */
	workspaceId?: string;
	projectId?: string;
}

export interface FindLinkedOptions {
	/** Resolve a branch for a git checkout not in the index. Returns null if not git. */
	resolveBranch?: (dir: string) => Promise<string | null>;
	/** Max directory depth to descend from the worktree root (default 4). */
	maxDepth?: number;
	/** Max in-flight filesystem operations (default 32). */
	concurrency?: number;
}

export async function findLinkedWorktrees(
	root: string,
	index: WorktreeIndexEntry[],
	opts: FindLinkedOptions = {},
): Promise<LinkedTarget[]> {
	const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
	const out: LinkedTarget[] = [];
	const limit = createLimiter(opts.concurrency ?? DEFAULT_CONCURRENCY);
	const readdir = (dir: string) =>
		limit(() => fs.readdir(dir, { withFileTypes: true })).catch(() => []);

	// Compare against canonical paths: targets below are realpath-resolved, so the
	// index must be too, or symlinked/case-differing roots (e.g. macOS /var ->
	// /private/var) would misclassify a tracked worktree as external.
	const resolvedIndex = await Promise.all(
		index.map(async (w) => ({
			...w,
			path: await limit(() => fs.realpath(w.path)).catch(() => w.path),
		})),
	);
	// longest path first => the most specific worktree wins on a prefix match
	const sorted = resolvedIndex.sort((a, b) => b.path.length - a.path.length);

	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > maxDepth) return;
		const entries = await readdir(dir);
		await Promise.all(
			entries.map(async (e) => {
				if (PRUNE.has(e.name)) return;
				const full = path.join(dir, e.name);
				if (DEP_DIRS.has(e.name) && e.isDirectory()) {
					await scanDepDir(full, e.name); // leaf: inspect, never recurse in
				} else if (e.isDirectory() && !e.isSymbolicLink()) {
					await walk(full, depth + 1); // never traverse THROUGH a symlink
				}
			}),
		);
	}

	async function scanDepDir(depDir: string, dirName: string): Promise<void> {
		const ecosystem: LinkedTarget["ecosystem"] =
			dirName === "vendor" ? "composer" : "npm";
		const entries = await readdir(depDir);
		await Promise.all(
			entries.map(async (e) => {
				if (
					ecosystem === "npm" &&
					e.name.startsWith("@") &&
					e.isDirectory() &&
					!e.isSymbolicLink()
				) {
					// npm scoped packages live one level deeper; keep the scope in the
					// package name but report the link against the node_modules dir.
					const scope = path.join(depDir, e.name);
					const scoped = await readdir(scope);
					await Promise.all(
						scoped.map((s) =>
							considerLink(
								path.join(scope, s.name),
								`${e.name}/${s.name}`,
								depDir,
								ecosystem,
							),
						),
					);
				} else if (
					ecosystem === "composer" &&
					e.isDirectory() &&
					!e.isSymbolicLink()
				) {
					// composer packages live under vendor/<vendor-name>/<package>; the
					// vendor-name dir is part of the source dir, the leaf is the package.
					const vendorName = path.join(depDir, e.name);
					const pkgs = await readdir(vendorName);
					await Promise.all(
						pkgs.map((p) =>
							considerLink(
								path.join(vendorName, p.name),
								p.name,
								vendorName,
								ecosystem,
							),
						),
					);
				} else {
					await considerLink(
						path.join(depDir, e.name),
						e.name,
						depDir,
						ecosystem,
					);
				}
			}),
		);
	}

	async function considerLink(
		entryPath: string,
		pkg: string,
		depDir: string,
		ecosystem: LinkedTarget["ecosystem"],
	): Promise<void> {
		const lst = await limit(() => fs.lstat(entryPath)).catch(() => null);
		if (!lst?.isSymbolicLink()) return;
		const target = await limit(() => fs.realpath(entryPath)).catch(() => null);
		if (!target) return;
		const common = {
			sourceDir: path.relative(root, depDir),
			ecosystem,
			packageName: pkg,
			targetPath: target,
		};
		const hit = sorted.find(
			(w) => target === w.path || target.startsWith(w.path + path.sep),
		);
		if (hit?.workspaceId) {
			out.push({
				...common,
				kind: "tracked",
				label: hit.label,
				targetWorkspaceId: hit.workspaceId,
				targetProjectId: hit.projectId,
			});
			return;
		}
		if (hit) {
			out.push({ ...common, kind: "untracked", label: hit.label });
			return;
		}
		const branch = opts.resolveBranch
			? await opts.resolveBranch(target).catch(() => null)
			: null;
		out.push({
			...common,
			kind: branch ? "untracked" : "external",
			label: branch ?? path.basename(target),
		});
	}

	await walk(root, 0);
	out.sort(
		(a, b) =>
			a.sourceDir.localeCompare(b.sourceDir) ||
			a.packageName.localeCompare(b.packageName),
	);
	return out;
}
