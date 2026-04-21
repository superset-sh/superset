import type { SimpleGit } from "simple-git";
import { resolveUpstream } from "../../../../runtime/git/refs";
import type { Branch, ChangedFile, FileStatus } from "../types";

/** Map git's single-letter status codes to GitHub-aligned FileStatus */
export function mapGitStatus(code: string): FileStatus {
	switch (code) {
		case "A":
			return "added";
		case "M":
			return "modified";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		case "T":
			return "changed";
		case "?":
			return "untracked";
		default:
			return "modified";
	}
}

/**
 * Parse the NUL-delimited output of `git diff --numstat -z`. Renames
 * appear as `<add>\t<del>\t\0<old>\0<new>\0` — three NUL-separated
 * cells — and are indexed under both source and destination paths so
 * callers keyed by either get a hit.
 */
export function parseNumstat(
	raw: string,
): Map<string, { additions: number; deletions: number }> {
	const result = new Map<string, { additions: number; deletions: number }>();
	const entries = raw.split("\0");
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		const t1 = entry.indexOf("\t");
		const t2 = t1 >= 0 ? entry.indexOf("\t", t1 + 1) : -1;
		if (t1 < 0 || t2 < 0) continue;
		const add = entry.slice(0, t1);
		const del = entry.slice(t1 + 1, t2);
		const pathMaybe = entry.slice(t2 + 1);
		const stats = {
			additions: add === "-" ? 0 : Number.parseInt(add || "0", 10),
			deletions: del === "-" ? 0 : Number.parseInt(del || "0", 10),
		};
		if (pathMaybe === "") {
			const oldPath = entries[++i] ?? "";
			const newPath = entries[++i] ?? "";
			if (newPath) result.set(newPath, stats);
			if (oldPath) result.set(oldPath, stats);
		} else {
			result.set(pathMaybe, stats);
		}
	}
	return result;
}

/**
 * Parse `git diff --name-status -z`. Each record is the status letter
 * followed by one path (regular) or two paths (rename/copy), with NUL
 * separators. Using -z avoids path quoting mismatches with numstat -z
 * for non-ASCII filenames.
 */
export function parseNameStatus(
	raw: string,
): Array<{ status: string; path: string; oldPath?: string }> {
	const results: Array<{ status: string; path: string; oldPath?: string }> = [];
	const fields = raw.split("\0");
	for (let i = 0; i < fields.length; i++) {
		const head = fields[i];
		if (!head) continue;
		const statusCode = head[0] ?? "?";
		if (statusCode === "R" || statusCode === "C") {
			const oldPath = fields[++i] ?? "";
			const newPath = fields[++i] ?? "";
			results.push({ status: statusCode, path: newPath, oldPath });
		} else {
			const path = fields[++i] ?? "";
			results.push({ status: statusCode, path });
		}
	}
	return results;
}

export async function getDefaultBranchName(
	git: SimpleGit,
): Promise<string | null> {
	try {
		const ref = await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"--short",
		]);
		return ref.trim().replace(/^origin\//, "");
	} catch {
		return null;
	}
}

/**
 * Resolve the base comparison for "this branch vs its upstream default"
 * views. Honors the local default branch's configured upstream
 * (e.g. `upstream/main`) before falling back to `origin/<name>`. Returns
 * null when no default branch can be determined.
 */
export async function resolveBaseComparison(
	git: SimpleGit,
	explicitBranch?: string,
): Promise<{ branchName: string; baseRef: string } | null> {
	const branchName = explicitBranch ?? (await getDefaultBranchName(git));
	if (!branchName) return null;
	const upstream = await resolveUpstream(git, branchName);
	// Git encodes a branch tracking another local branch as
	// `branch.<name>.remote = .` — in that case the merge target is
	// already a bare branch name in this repo, not `./<name>`.
	const baseRef = upstream
		? upstream.remote === "."
			? upstream.remoteBranch
			: `${upstream.remote}/${upstream.remoteBranch}`
		: `origin/${branchName}`;
	return { branchName, baseRef };
}

export async function buildBranch(
	git: SimpleGit,
	name: string,
	isHead: boolean,
	compareRef?: string,
): Promise<Branch> {
	let upstream: string | null = null;
	let aheadCount = 0;
	let behindCount = 0;
	let lastCommitHash = "";
	let lastCommitDate = "";

	try {
		const remote = (
			await git.raw(["config", `branch.${name}.remote`]).catch(() => "")
		).trim();
		const merge = (
			await git.raw(["config", `branch.${name}.merge`]).catch(() => "")
		).trim();
		upstream =
			remote && merge ? `${remote}/${merge.replace("refs/heads/", "")}` : null;
	} catch {
		upstream = null;
	}

	if (compareRef) {
		try {
			const counts = (
				await git.raw([
					"rev-list",
					"--left-right",
					"--count",
					`${compareRef}...${name}`,
				])
			).trim();
			const [behind, ahead] = counts.split("\t").map(Number);
			aheadCount = ahead ?? 0;
			behindCount = behind ?? 0;
		} catch {}
	}

	try {
		const log = (await git.raw(["log", "-1", "--format=%H\t%aI", name])).trim();
		const [hash, date] = log.split("\t");
		lastCommitHash = hash ?? "";
		lastCommitDate = date ?? "";
	} catch {}

	return {
		name,
		isHead,
		upstream,
		aheadCount,
		behindCount,
		lastCommitHash,
		lastCommitDate,
	};
}

export async function getChangedFilesForDiff(
	git: SimpleGit,
	diffArgs: string[],
): Promise<ChangedFile[]> {
	try {
		const [nameStatusRaw, numstatRaw] = await Promise.all([
			git.raw(["diff", "--name-status", "-z", ...diffArgs]),
			git.raw(["diff", "--numstat", "-z", ...diffArgs]),
		]);
		const nameStatus = parseNameStatus(nameStatusRaw);
		const numstat = parseNumstat(numstatRaw);
		return nameStatus
			.filter((f) => f.path)
			.map((f) => ({
				path: f.path,
				oldPath: f.oldPath,
				status: mapGitStatus(f.status),
				additions: (numstat.get(f.path) ?? { additions: 0 }).additions,
				deletions: (numstat.get(f.path) ?? { deletions: 0 }).deletions,
			}));
	} catch {
		return [];
	}
}
