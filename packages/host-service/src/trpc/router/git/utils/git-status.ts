import type { SimpleGit } from "simple-git";
import type { Branch, ChangedFile } from "../types";
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

export async function getGitStatusSnapshot({
	git,
	worktreePath,
	baseBranch,
}: {
	git: SimpleGit;
	worktreePath: string;
	baseBranch?: string;
}): Promise<GitStatusSnapshot> {
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
		git.status(),
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
	const unstaged: ChangedFile[] = [];
	const untrackedFiles: ChangedFile[] = [];
	for (const file of status.files) {
		const wd = file.working_dir;
		if (file.index === "?" && wd === "?") {
			const entry: ChangedFile = {
				path: file.path,
				status: "untracked",
				additions: 0,
				deletions: 0,
			};
			untrackedFiles.push(entry);
			unstaged.push(entry);
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
		currentBranch,
		defaultBranch,
		againstBase,
		staged,
		unstaged: mergedUnstaged,
		ignoredPaths,
	};
}
