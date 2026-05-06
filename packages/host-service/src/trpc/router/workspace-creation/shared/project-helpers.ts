import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";
import { resolveLocalRepo } from "../../project/utils/resolve-repo";

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
	/** Local clone path. Required — searches operate against the local clone. */
	repoPath: string;
}

/**
 * Resolve `{owner, name, repoPath}` for a project by reading the **live**
 * GitHub remote of the local clone. Both the cloud `repoCloneUrl` and the
 * cached `projects.repoOwner`/`repoName` columns are setup-time snapshots
 * that can drift (rename, fork, manual remote re-point); GitHub queries
 * must always target wherever the user's actual remote points right now.
 *
 * Throws `PROJECT_NOT_SETUP` if the project has no local clone on this
 * host, or `BAD_REQUEST` if the local clone has no GitHub remote.
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

	const resolved = await resolveLocalRepo(local.repoPath);
	if (!resolved.parsed) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${local.repoPath} has no GitHub remote.`,
		});
	}

	return {
		owner: resolved.parsed.owner,
		name: resolved.parsed.name,
		repoPath: resolved.repoPath,
	};
}
