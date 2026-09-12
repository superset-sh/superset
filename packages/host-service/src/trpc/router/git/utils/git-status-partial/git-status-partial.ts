import { access, realpath } from "node:fs/promises";
import { isAbsolute, join, posix, relative } from "node:path";
import type { SimpleGit } from "simple-git";
import type { ChangedFile } from "../../types";
import {
	countUntrackedFileLines,
	expandUntrackedDirectories,
	mapGitStatus,
	parseNumstat,
} from "../git-helpers";
import {
	type GitStatusSnapshot,
	MAX_UNTRACKED_STAT_FILES,
	parseIgnoredPaths,
} from "../git-status";

export interface GitStatusPartial {
	paths: string[];
	unstaged: ChangedFile[];
	/**
	 * Ignored entries under `ignoredScope`, the top-level directories the
	 * batch touched. Git lists an all-ignored directory as one collapsed
	 * entry, so a file-level scope would miss the directory that contains
	 * it; scoping to the top level reproduces the full walk's shape.
	 */
	ignoredPaths?: string[];
	ignoredScope?: string[];
}

/**
 * `:(literal)` stops git from reading `[`, `*` and `?` in a path as glob
 * syntax. Without it a batch for `app/[id]/page.tsx` also matches
 * `app/i/page.tsx`, which the literal-prefix eviction below would then
 * leave in the snapshot as a duplicate row.
 */
export function literalPathspecs(paths: string[]): string[] {
	return paths.map((path) => `:(literal)${path}`);
}

export async function getGitStatusPartial({
	git,
	worktreePath,
	paths,
}: {
	git: SimpleGit;
	worktreePath: string;
	paths: string[];
}): Promise<GitStatusPartial> {
	// A caller may spell an absolute path through the worktree's realpath
	// (`/private/tmp` for `/tmp` on macOS); accept either root.
	const realWorktreePath = await realpath(worktreePath).catch(
		() => worktreePath,
	);
	// Git represents a nested repository as its root entry, even when a
	// watcher reports an edited file below it. A deeper pathspec omits that
	// entry entirely. Share ancestor probes across this bounded batch.
	const nestedRoots = new Map<string, Promise<boolean>>();
	const relativePaths = coalescePaths(
		toWorktreeRelative([worktreePath, realWorktreePath], paths),
	);
	const scope = coalescePaths(
		await Promise.all(
			relativePaths.map(async (filePath) => {
				const parts = filePath.split("/");
				for (let depth = 1; depth < parts.length; depth++) {
					const ancestor = parts.slice(0, depth).join("/");
					let isRepo = nestedRoots.get(ancestor);
					if (!isRepo) {
						isRepo = access(join(worktreePath, ancestor, ".git")).then(
							() => true,
							() => false,
						);
						nestedRoots.set(ancestor, isRepo);
					}
					if (await isRepo) return ancestor;
				}
				return filePath;
			}),
		),
	);
	if (scope.length === 0) return { paths: [], unstaged: [] };
	const pathspecs = literalPathspecs(scope);
	const ignoredScope = [
		...new Set(scope.map((path) => path.split("/")[0] ?? path)),
	];

	const [status, numstatRaw, ignoredRaw] = await Promise.all([
		git.status(["--untracked-files=normal", "--", ...pathspecs]),
		git
			.raw(["diff", "--numstat", "-z", "-M", "--", ...pathspecs])
			.catch(() => ""),
		git
			.raw([
				"ls-files",
				"--others",
				"--ignored",
				"--exclude-standard",
				"--directory",
				"-z",
				"--",
				...literalPathspecs(ignoredScope),
			])
			// A failed listing must not read as "nothing ignored here": the
			// merge would evict every entry under the scope.
			.catch(() => null),
	]);
	const numstat = parseNumstat(numstatRaw);
	const ignoredPaths =
		ignoredRaw === null ? undefined : parseIgnoredPaths(ignoredRaw);

	const expandedUntracked = await expandUntrackedDirectories(
		git,
		status.files
			.filter((file) => file.index === "?" && file.working_dir === "?")
			.map((file) => file.path),
	);

	const unstaged: ChangedFile[] = [];
	const untrackedFiles: ChangedFile[] = [];
	for (const file of status.files) {
		const wd = file.working_dir;
		if (file.index === "?" && wd === "?") {
			for (const path of expandedUntracked.get(file.path) ?? [file.path]) {
				const entry: ChangedFile = {
					path,
					status: "untracked",
					additions: null,
					deletions: null,
				};
				untrackedFiles.push(entry);
				unstaged.push(entry);
			}
		} else if (wd && wd !== " ") {
			const stats = numstat.get(file.path) ?? {
				additions: 0,
				deletions: 0,
				isBinary: false,
			};
			unstaged.push({
				path: file.path,
				oldPath:
					wd === "R" && file.from && file.from !== file.path
						? file.from
						: undefined,
				status: mapGitStatus(wd),
				additions: stats.additions,
				deletions: stats.deletions,
				isBinary: stats.isBinary,
			});
		}
	}

	if (untrackedFiles.length <= MAX_UNTRACKED_STAT_FILES) {
		await countUntrackedFileLines(worktreePath, untrackedFiles);
	}

	return { paths: scope, unstaged, ignoredPaths, ignoredScope };
}

/**
 * The watcher only emits worktree-relative paths, but accept absolute ones
 * inside the worktree and drop anything that escapes it: a path git cannot
 * scope to would otherwise fail every retry until the next broad change.
 */
function toWorktreeRelative(roots: string[], paths: string[]): string[] {
	const result: string[] = [];
	for (const raw of paths) {
		const resolved = isAbsolute(raw)
			? (roots
					.map((root) => relative(root, raw))
					.find((candidate) => !candidate.startsWith("..")) ?? "..")
			: raw;
		// `.`/`./x`/`x/` are legal pathspecs but not the literal keys the
		// eviction compares against; `.` alone would replay the whole tree.
		const path = posix
			.normalize(resolved.replace(/\\/g, "/"))
			.replace(/\/+$/, "");
		if (!path || path === "." || isAbsolute(path)) continue;
		if (path.split("/").includes("..")) continue;
		result.push(path);
	}
	return result;
}

/**
 * Dedupe and drop paths already covered by an ancestor. Paths are folded to
 * NFC first: macOS FSEvents reports decomposed names while git (with
 * `core.precomposeunicode`) prints composed ones, and a literal string
 * comparison between the two would leave the stale entry in place.
 */
export function coalescePaths(paths: string[]): string[] {
	const sorted = [
		...new Set(paths.map((path) => path.normalize("NFC"))),
	].sort();
	const result: string[] = [];
	for (const path of sorted) {
		const last = result[result.length - 1];
		if (last !== undefined && isUnder(path, last)) continue;
		result.push(path);
	}
	return result;
}

function isUnder(path: string, ancestor: string): boolean {
	return path === ancestor || path.startsWith(`${ancestor}/`);
}

function isCovered(scopes: string[], path: string): boolean {
	return scopes.some((scope) => isUnder(path, scope));
}

export function applyStatusPartial(
	snapshot: GitStatusSnapshot,
	partial: GitStatusPartial,
): GitStatusSnapshot {
	if (partial.paths.length === 0) return snapshot;

	const covered = (path: string) => isCovered(partial.paths, path);

	const unstaged = snapshot.unstaged.filter((file) => {
		if (file.oldPath !== undefined && covered(file.oldPath)) return false;
		return !covered(file.path);
	});

	const ignoredScope = partial.ignoredScope ?? [];
	const ignoredPaths =
		partial.ignoredPaths && ignoredScope.length > 0
			? [
					...new Set([
						...snapshot.ignoredPaths.filter(
							(path) => !isCovered(ignoredScope, path),
						),
						...partial.ignoredPaths,
					]),
				].sort()
			: snapshot.ignoredPaths;

	return {
		...snapshot,
		unstaged: [...unstaged, ...partial.unstaged].sort((a, b) =>
			a.path.localeCompare(b.path),
		),
		ignoredPaths,
	};
}

export function shouldRecomputeInFull(
	snapshot: GitStatusSnapshot,
	partial: GitStatusPartial,
): boolean {
	if (partial.unstaged.some((file) => file.status === "deleted")) return true;
	// A full walk folds a deletion into the rename it belongs to. A scoped
	// re-read of either side sees only an untracked file, so patching would
	// drop the deletion along with the rename.
	if (
		snapshot.unstaged.some(
			(file) =>
				file.oldPath !== undefined &&
				(isCovered(partial.paths, file.path) ||
					isCovered(partial.paths, file.oldPath)),
		)
	) {
		return true;
	}
	// A new untracked or intent-to-add file may be the other half of a
	// deletion the scoped read cannot see — including one already folded
	// into a rename, which a better match would re-pair.
	if (
		!partial.unstaged.some(
			(file) => file.status === "untracked" || file.status === "added",
		)
	) {
		return false;
	}
	return snapshot.unstaged.some(
		(file) => file.status === "deleted" || file.oldPath !== undefined,
	);
}
