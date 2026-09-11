import type { SimpleGit } from "simple-git";
import type { ChangedFile } from "../../types";
import {
	countUntrackedFileLines,
	expandUntrackedDirectories,
	mapGitStatus,
	parseNumstat,
} from "../git-helpers";
import type { GitStatusSnapshot } from "../git-status";

export interface GitStatusPartial {
	paths: string[];
	unstaged: ChangedFile[];
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
	if (paths.length === 0) return { paths: [], unstaged: [] };

	const scope = coalescePaths(paths);

	const [status, numstatRaw] = await Promise.all([
		git.status(["--untracked-files=normal", "--", ...scope]),
		git.raw(["diff", "--numstat", "-z", "-M", "--", ...scope]).catch(() => ""),
	]);
	const numstat = parseNumstat(numstatRaw);

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
				status: mapGitStatus(wd),
				additions: stats.additions,
				deletions: stats.deletions,
				isBinary: stats.isBinary,
			});
		}
	}

	await countUntrackedFileLines(worktreePath, untrackedFiles);

	return { paths: scope, unstaged };
}

export function coalescePaths(paths: string[]): string[] {
	const sorted = [...new Set(paths)].sort();
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

export function applyStatusPartial(
	snapshot: GitStatusSnapshot,
	partial: GitStatusPartial,
): GitStatusSnapshot {
	if (partial.paths.length === 0) return snapshot;

	const covered = (path: string) =>
		partial.paths.some((scope) => isUnder(path, scope));

	const unstaged = snapshot.unstaged.filter((file) => {
		if (file.oldPath !== undefined && covered(file.oldPath)) return false;
		return !covered(file.path);
	});

	return {
		...snapshot,
		unstaged: [...unstaged, ...partial.unstaged].sort((a, b) =>
			a.path.localeCompare(b.path),
		),
	};
}

export function shouldRecomputeInFull(
	snapshot: GitStatusSnapshot,
	partial: GitStatusPartial,
): boolean {
	return (
		partial.unstaged.some((file) => file.status === "deleted") ||
		snapshot.unstaged.some((file) => file.status === "deleted")
	);
}
