import { parseGitRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import { detectProvider } from "../../../../runtime/repo-providers/detect-provider";
import type { GitProvider } from "../../../../runtime/repo-providers/types";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";
import { getAllRemoteUrls } from "../../project/utils/git-remote";

export function projectNotSetupError(projectId: string): TRPCError {
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message: "Project is not set up on this host",
		cause: {
			kind: "PROJECT_NOT_SETUP",
			projectId,
		} satisfies ProjectNotSetupCause,
	});
}

export interface ResolvedGithubRepo {
	owner: string;
	name: string;
	/** Canonical local clone path. */
	repoPath: string;
}

export interface ResolvedRepo {
	provider: GitProvider | "unknown";
	host: string;
	owner: string;
	name: string;
	/** Canonical local clone path. */
	repoPath: string;
}

/**
 * Resolve provider-aware `{provider, host, owner, name, repoPath}` for a
 * project from the **live** local git remote. Cloud `repoCloneUrl` and cached
 * `projects.repoOwner`/`repoName` are setup-time snapshots that drift on
 * rename/fork/remote re-point; queries must target wherever the remote points
 * right now.
 *
 * `rev-parse --show-toplevel` validates the path is a git repo.
 * Reads remotes via `git config --get-regexp ^remote\..*\.url$` to avoid
 * `git remote -v`'s `[blob:none]` partial-clone markers.
 *
 * Remote preference: configured `remoteName` → `origin` → first parseable remote.
 *
 * Self-managed GitLab hosts that parseGitRemote returns as "unknown" are
 * resolved via a capability probe (GET /api/v4/version) — see §8 in detectProvider.
 */
export async function resolveRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedRepo> {
	const local = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!local?.repoPath) {
		throw projectNotSetupError(projectId);
	}

	let gitRoot: string;
	try {
		gitRoot = (
			await createUserSimpleGit(local.repoPath).revparse(["--show-toplevel"])
		).trim();
	} catch (err) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to inspect git repository at ${local.repoPath}`,
			cause: err,
		});
	}

	const rawRemotes = await getAllRemoteUrls(createUserSimpleGit(gitRoot));

	// Build a map of remote name → ParsedRemote for all parseable remotes.
	const parsed = new Map<
		string,
		NonNullable<ReturnType<typeof parseGitRemote>>
	>();
	for (const [name, url] of rawRemotes) {
		const result = parseGitRemote(url);
		if (result) {
			parsed.set(name, result);
		}
	}

	const preferred =
		(local.remoteName ? parsed.get(local.remoteName) : undefined) ??
		parsed.get("origin") ??
		parsed.values().next().value;

	if (!preferred) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${gitRoot} has no recognizable remote.`,
		});
	}

	// §8: self-managed hosts parse as provider:"unknown" from parseGitRemote
	// (which only classifies github.com/gitlab.com). Probe the host to detect
	// GitLab instances. github.com/gitlab.com short-circuit without a network call.
	let provider: GitProvider | "unknown" = preferred.provider;
	if (provider === "unknown" && preferred.host) {
		provider = await detectProvider(preferred.host);
	}

	return {
		provider,
		host: preferred.host,
		owner: preferred.owner,
		name: preferred.name,
		repoPath: gitRoot,
	};
}

/**
 * Resolve `{owner, name, repoPath}` for a project from the **live** local
 * git remote. Cloud `repoCloneUrl` and cached `projects.repoOwner`/`repoName`
 * are setup-time snapshots that drift on rename/fork/remote re-point;
 * GitHub queries must target wherever the remote points right now.
 *
 * Thin wrapper over `resolveRepo` that throws when the resolved remote is not
 * a GitHub remote — preserves the existing GitHub-only error contract for
 * callers that only handle GitHub.
 */
export async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedGithubRepo> {
	const resolved = await resolveRepo(ctx, projectId);

	if (resolved.provider !== "github") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${resolved.repoPath} has no GitHub remote.`,
		});
	}

	return {
		owner: resolved.owner,
		name: resolved.name,
		repoPath: resolved.repoPath,
	};
}
