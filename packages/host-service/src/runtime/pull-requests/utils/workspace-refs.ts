// Reads the workspace's branch/HEAD/upstream trio for PR sync. Lives in its
// own module (not pull-requests.ts) so the worker task can import it without
// pulling the runtime's DB/Octokit graph into the worker bundle.

import { parseGitHubRemote } from "@superset/shared/github-remote";
import type { SimpleGit } from "simple-git";

const UNBORN_HEAD_ERROR_PATTERNS = [
	"ambiguous argument 'head'",
	"unknown revision or path not in the working tree",
	"bad revision 'head'",
	"not a valid object name head",
	"needed a single revision",
];

export interface WorkspaceUpstream {
	owner: string;
	name: string;
	branch: string;
}

export interface WorkspaceRefsSnapshot {
	branch: string | null;
	headSha: string | null;
	upstream: WorkspaceUpstream | null;
}

async function getCurrentBranchName(git: SimpleGit): Promise<string | null> {
	try {
		const branch = await git.raw(["symbolic-ref", "--short", "HEAD"]);
		const trimmed = branch.trim();
		return trimmed || null;
	} catch {
		try {
			const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
			const trimmed = branch.trim();
			return trimmed && trimmed !== "HEAD" ? trimmed : null;
		} catch {
			return null;
		}
	}
}

async function getHeadSha(git: SimpleGit): Promise<string | null> {
	try {
		const branch = await git.revparse(["HEAD"]);
		const trimmed = branch.trim();
		return trimmed || null;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message.toLowerCase()
				: String(error).toLowerCase();
		if (
			UNBORN_HEAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
		) {
			return null;
		}

		throw error;
	}
}

// `pushRemote` / `branch.remote` accept a remote name or a URL.
async function resolveRemoteValueToUrl(
	git: SimpleGit,
	value: string,
): Promise<string | null> {
	if (/^(https?:|git@|ssh:)/.test(value)) return value;
	try {
		const url = await git.remote(["get-url", value]);
		return typeof url === "string" ? url.trim() || null : null;
	} catch {
		return null;
	}
}

async function resolveWorkspaceUpstream(
	git: SimpleGit,
	localBranch: string,
): Promise<WorkspaceUpstream | null> {
	// `@{push}` resolves remote+branch respecting all config precedence in one call.
	const pushRef = await tryRaw(git, [
		"rev-parse",
		"--abbrev-ref",
		`${localBranch}@{push}`,
	]);
	if (pushRef) {
		const slash = pushRef.indexOf("/");
		if (slash > 0) {
			const url = await resolveRemoteValueToUrl(git, pushRef.slice(0, slash));
			const parsed = url ? parseGitHubRemote(url) : null;
			if (parsed) {
				return {
					owner: parsed.owner,
					name: parsed.name,
					branch: pushRef.slice(slash + 1),
				};
			}
		}
	}

	// Fallback when `@{push}` isn't configured — mirrors gh's config chain.
	// Require `branch.<n>.merge`; without it, `remote.pushDefault` alone would
	// re-open the same-name collision hole on untracked branches.
	const mergeRef = await tryConfig(git, `branch.${localBranch}.merge`);
	const trackedBranch = mergeRef?.replace(/^refs\/heads\//, "");
	if (!trackedBranch) return null;

	const remoteValue =
		(await tryConfig(git, `branch.${localBranch}.pushRemote`)) ??
		(await tryConfig(git, "remote.pushDefault")) ??
		(await tryConfig(git, `branch.${localBranch}.remote`));
	if (!remoteValue) return null;

	const url = await resolveRemoteValueToUrl(git, remoteValue);
	const parsed = url ? parseGitHubRemote(url) : null;
	if (!parsed) return null;

	// `gh pr checkout` renames the local branch on collision (`main` →
	// `quueli-main`) but the PR's headRefName stays `main`, so we key on the
	// tracked remote branch, not the local name.
	return { owner: parsed.owner, name: parsed.name, branch: trackedBranch };
}

async function tryRaw(git: SimpleGit, args: string[]): Promise<string | null> {
	try {
		return (await git.raw(args)).trim() || null;
	} catch {
		return null;
	}
}

async function tryConfig(git: SimpleGit, key: string): Promise<string | null> {
	return tryRaw(git, ["config", "--get", key]);
}

/**
 * One call = the whole per-workspace read the PR-sync loop needs. Unborn
 * HEAD yields `{branch: null, ...}`; unexpected `rev-parse HEAD` failures
 * propagate (the sync loop logs and skips the workspace).
 */
export async function readWorkspaceRefs(
	git: SimpleGit,
): Promise<WorkspaceRefsSnapshot> {
	const branch = await getCurrentBranchName(git);
	if (!branch) return { branch: null, headSha: null, upstream: null };

	const headSha = await getHeadSha(git);
	const upstream = await resolveWorkspaceUpstream(git, branch);
	return { branch, headSha, upstream };
}
