import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";
import { getGitHubRemotes } from "../../project/utils/git-remote";

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

/**
 * Resolve `{owner, name, repoPath}` for a project by reading the **live**
 * GitHub remote of the local clone. Both the cloud `repoCloneUrl` and the
 * cached `projects.repoOwner`/`repoName` columns are setup-time snapshots
 * that drift (rename, fork, manual remote re-point); GitHub queries must
 * always target wherever the user's actual remote points right now.
 *
 * Two layers of canonicalization here, both intentional:
 *
 *   1. `git rev-parse --show-toplevel` resolves the stored repoPath to its
 *      canonical git working-tree root and confirms it's a git repo.
 *   2. `getGitHubRemotes` reads remote URLs via
 *      `git config --get-regexp ^remote\..*\.url$` — the machine-stable
 *      path. We avoid `git remote -v` because it appends partial-clone
 *      markers (`[blob:none]`) when `remote.<name>.promisor` is set.
 *
 * Prefers the user-configured `remoteName` from project setup, then
 * `origin`, then the first GitHub remote on the repo.
 */
export async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedGithubRepo> {
	const local = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!local?.repoPath) {
		throw projectNotSetupError(projectId);
	}

	let gitRoot: string;
	try {
		gitRoot = (
			await simpleGit(local.repoPath).revparse(["--show-toplevel"])
		).trim();
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Not a git repository: ${local.repoPath}`,
		});
	}

	const remotes = await getGitHubRemotes(simpleGit(gitRoot));
	const preferred =
		(local.remoteName ? remotes.get(local.remoteName) : undefined) ??
		remotes.get("origin") ??
		remotes.values().next().value;

	if (!preferred) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${gitRoot} has no GitHub remote.`,
		});
	}

	return {
		owner: preferred.owner,
		name: preferred.name,
		repoPath: gitRoot,
	};
}
