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
}

export async function findLinkedWorktrees(
	root: string,
	index: WorktreeIndexEntry[],
	opts: FindLinkedOptions = {},
): Promise<LinkedTarget[]> {
	const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
	const out: LinkedTarget[] = [];
	// longest path first => the most specific worktree wins on a prefix match
	const sorted = [...index].sort((a, b) => b.path.length - a.path.length);

	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > maxDepth) return;
		const entries = await fs
			.readdir(dir, { withFileTypes: true })
			.catch(() => []);
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
		const entries = await fs
			.readdir(depDir, { withFileTypes: true })
			.catch(() => []);
		await Promise.all(
			entries.map(async (e) => {
				if (e.name.startsWith("@") && e.isDirectory() && !e.isSymbolicLink()) {
					// npm scoped packages live one level deeper; keep the scope in the
					// package name but report the link against the node_modules dir.
					const scope = path.join(depDir, e.name);
					const scoped = await fs
						.readdir(scope, { withFileTypes: true })
						.catch(() => []);
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
					const pkgs = await fs
						.readdir(vendorName, { withFileTypes: true })
						.catch(() => []);
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
		const lst = await fs.lstat(entryPath).catch(() => null);
		if (!lst?.isSymbolicLink()) return;
		const target = await fs.realpath(entryPath).catch(() => null);
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
