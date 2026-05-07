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
 * Resolve `{owner, name, repoPath}` for a project from the **live** local
 * git remote. Cloud `repoCloneUrl` and cached `projects.repoOwner`/`repoName`
 * are setup-time snapshots that drift on rename/fork/remote re-point;
 * GitHub queries must target wherever the remote points right now.
 *
 * `rev-parse --show-toplevel` validates the path is a git repo.
 * `getGitHubRemotes` reads via `git config --get-regexp ^remote\..*\.url$`
 * to avoid `git remote -v`'s `[blob:none]` partial-clone markers.
 *
 * Remote preference: configured `remoteName` → `origin` → first GitHub remote.
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
	} catch (err) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to inspect git repository at ${local.repoPath}`,
			cause: err,
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
