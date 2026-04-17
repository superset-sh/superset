import type { SimpleGit } from "simple-git";
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

export function parseNumstat(
	raw: string,
): Map<string, { additions: number; deletions: number }> {
	const result = new Map<string, { additions: number; deletions: number }>();
	for (const line of raw.trim().split("\n")) {
		if (!line) continue;
		const [add, del, ...pathParts] = line.split("\t");
		const path = pathParts.join("\t");
		result.set(path, {
			additions: add === "-" ? 0 : Number.parseInt(add ?? "0", 10),
			deletions: del === "-" ? 0 : Number.parseInt(del ?? "0", 10),
		});
	}
	return result;
}

export function parseNameStatus(
	raw: string,
): Array<{ status: string; path: string; oldPath?: string }> {
	const results: Array<{ status: string; path: string; oldPath?: string }> = [];
	for (const line of raw.trim().split("\n")) {
		if (!line) continue;
		const parts = line.split("\t");
		const statusCode = parts[0]?.[0] ?? "?";
		if (statusCode === "R" || statusCode === "C") {
			results.push({
				status: statusCode,
				path: parts[2] ?? "",
				oldPath: parts[1],
			});
		} else {
			results.push({ status: statusCode, path: parts[1] ?? "" });
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
			git.raw(["diff", "--name-status", ...diffArgs]),
			git.raw(["diff", "--numstat", ...diffArgs]),
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
