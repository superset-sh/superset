import type { SimpleGit } from "simple-git";
import type { Branch, ChangedFile } from "../types";
import type { BaseRefFetchTarget } from "./base-ref-freshness";
import {
	buildBranch,
	countUntrackedFileLines,
	detectUnstagedRenames,
	getChangedFilesForDiff,
	mapGitStatus,
	parseNumstat,
	resolveBaseComparison,
} from "./git-helpers";

export interface GitStatusSnapshot {
	currentBranch: Branch;
	defaultBranch: Branch;
	againstBase: ChangedFile[];
	staged: ChangedFile[];
	unstaged: ChangedFile[];
	ignoredPaths: string[];
}

export interface GitStatusSnapshotComputation {
	snapshot: GitStatusSnapshot;
	/** Resolved in the worker, scheduled by the process-wide coordinator. */
	baseRefFetchTarget: BaseRefFetchTarget | null;
}

/**
 * Expand the `dir/` entries `--untracked-files=normal` collapses back into the
 * individual files `-uall` would have listed, keyed by the collapsed entry.
 * The walk is scoped to the untracked directories themselves rather than the
 * whole worktree, so it costs a fraction of what `-uall` does — and nothing at
 * all in the common case where there are no untracked directories.
 */
async function expandUntrackedDirectories(
	git: SimpleGit,
	untrackedPaths: string[],
): Promise<Map<string, string[]>> {
	const dirs = untrackedPaths.filter((path) => path.endsWith("/"));
	const expanded = new Map<string, string[]>();
	if (dirs.length === 0) return expanded;

	// `--exclude-standard` matches what status itself honours, including
	// .gitignore files nested inside the untracked directory.
	const raw = await git
		.raw(["ls-files", "--others", "--exclude-standard", "-z", "--", ...dirs])
		.catch(() => "");

	for (const path of raw.split("\0").filter(Boolean)) {
		const dir = dirs.find((candidate) => path.startsWith(candidate));
		if (!dir) continue;
		const files = expanded.get(dir);
		if (files) files.push(path);
		else expanded.set(dir, [path]);
	}
	return expanded;
}

export async function getGitStatusSnapshot({
	git,
	worktreePath,
	baseBranch,
}: {
	git: SimpleGit;
	worktreePath: string;
	baseBranch?: string;
}): Promise<GitStatusSnapshotComputation> {
	const currentBranchName = (
		await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
	).trim();
	const base = await resolveBaseComparison(git, baseBranch);
	const defaultBranchName = base?.branchName ?? null;
	const baseRef = base?.baseRef ?? "HEAD";

	const [currentBranch, defaultBranch, status, ignoredRaw] = await Promise.all([
		buildBranch(git, currentBranchName, true, baseRef),
		defaultBranchName
			? buildBranch(git, defaultBranchName, false)
			: buildBranch(git, currentBranchName, true),
		// Override simple-git's hardcoded bare `-u` (= `all`). Git only consults
		// `core.untrackedCache` in `normal` mode, so `-uall` silently re-walks the
		// entire worktree on every refresh — reported at ~1.9s vs ~0.03s on a 60k
		// file repo. statusTask appends custom args after its own `-u` and git
		// honours the last flag, so this wins. `normal` collapses a wholly-
		// untracked directory to one `dir/` entry, which the expansion below
		// undoes.
		git.status(["--untracked-files=normal"]),
		git
			.raw([
				"ls-files",
				"--others",
				"--ignored",
				"--exclude-standard",
				"--directory",
			])
			.catch(() => ""),
	]);

	// Top-level gitignored paths. `--directory` collapses entirely-ignored
	// folders to a single entry (e.g. `node_modules`) instead of enumerating
	// every file inside, so this stays cheap in large repos.
	const ignoredPaths = ignoredRaw
		.split("\n")
		.map((line) => line.trim().replace(/\/$/, ""))
		.filter(Boolean);

	const againstBase = await getChangedFilesForDiff(git, [`${baseRef}...HEAD`]);

	// Staged — use status.files index character for correct status. `-M` lets
	// numstat collapse renamed entries without the tree-wide copy-source scan
	// that `-C` performs.
	const stagedNumstat = parseNumstat(
		await git
			.raw(["diff", "--numstat", "-z", "-M", "--cached"])
			.catch(() => ""),
	);
	const staged: ChangedFile[] = [];
	for (const file of status.files) {
		const idx = file.index;
		if (idx && idx !== " " && idx !== "?") {
			const stats = stagedNumstat.get(file.path) ?? {
				additions: 0,
				deletions: 0,
				isBinary: false,
			};
			staged.push({
				path: file.path,
				oldPath: file.from && file.from !== file.path ? file.from : undefined,
				status: mapGitStatus(idx),
				additions: stats.additions,
				deletions: stats.deletions,
				isBinary: stats.isBinary,
			});
		}
	}

	const unstagedNumstat = parseNumstat(
		await git.raw(["diff", "--numstat", "-z"]).catch(() => ""),
	);
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
			// Fall back to the entry itself when a collapsed directory expanded to
			// nothing, so a path never silently disappears from the panel.
			for (const path of expandedUntracked.get(file.path) ?? [file.path]) {
				const entry: ChangedFile = {
					path,
					status: "untracked",
					additions: 0,
					deletions: 0,
				};
				untrackedFiles.push(entry);
				unstaged.push(entry);
			}
		} else if (wd && wd !== " ") {
			const stats = unstagedNumstat.get(file.path) ?? {
				additions: 0,
				deletions: 0,
				isBinary: false,
			};
			unstaged.push({
				path: file.path,
				status: mapGitStatus(wd),
				additions: stats.additions,
				deletions: stats.deletions,
				isBinary: stats.isBinary,
			});
		}
	}
	await countUntrackedFileLines(worktreePath, untrackedFiles);

	const hasDeletions = unstaged.some((file) => file.status === "deleted");
	const renames = await detectUnstagedRenames(
		git,
		worktreePath,
		untrackedFiles.map((file) => file.path),
		hasDeletions,
	);

	let mergedUnstaged = unstaged;
	if (renames.length > 0) {
		const consumedDeleted = new Set<string>();
		const consumedUntracked = new Set<string>();
		for (const rename of renames) {
			consumedDeleted.add(rename.oldPath);
			consumedUntracked.add(rename.newPath);
		}
		mergedUnstaged = unstaged.filter((file) => {
			if (file.status === "deleted" && consumedDeleted.has(file.path))
				return false;
			if (file.status === "untracked" && consumedUntracked.has(file.path))
				return false;
			return true;
		});
		for (const rename of renames) {
			mergedUnstaged.push({
				path: rename.newPath,
				oldPath: rename.oldPath,
				status: rename.status,
				additions: rename.additions,
				deletions: rename.deletions,
				isBinary: rename.isBinary,
			});
		}
	}

	return {
		snapshot: {
			currentBranch,
			defaultBranch,
			againstBase,
			staged,
			unstaged: mergedUnstaged,
			ignoredPaths,
		},
		baseRefFetchTarget: base?.fetchTarget ?? null,
	};
}
