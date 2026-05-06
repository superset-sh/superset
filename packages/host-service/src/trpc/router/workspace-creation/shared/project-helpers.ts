import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";

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
	/** Local clone path; present iff the project is set up on this host. */
	repoPath: string | null;
}

/**
 * Resolve `{owner, name}` for a project, plus the local `repoPath` when the
 * project is set up on this machine. Tries the host-side `projects` row first
 * (no cloud round-trip, gives us a `cwd` for first-class `gh` calls) and
 * falls back to parsing the cloud `repoCloneUrl`.
 *
 * Intentionally does NOT depend on the cloud `github_repositories` join: that
 * row only exists if the GitHub App was installed for the org at create-time,
 * and projects created any other way would otherwise be unreachable for
 * PR/issue search even when `gh` would handle them just fine.
 */
export async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<ResolvedGithubRepo> {
	const local = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();

	if (local?.repoOwner && local.repoName) {
		return {
			owner: local.repoOwner,
			name: local.repoName,
			repoPath: local.repoPath,
		};
	}

	// `repoUrl` is set, but owner/name weren't backfilled — parse it.
	if (local?.repoUrl) {
		const parsed = parseGitHubRemote(local.repoUrl);
		if (parsed) {
			return {
				owner: parsed.owner,
				name: parsed.name,
				repoPath: local.repoPath,
			};
		}
	}

	const cloudProject = await ctx.api.v2Project.get.query({
		organizationId: ctx.organizationId,
		id: projectId,
	});

	if (cloudProject.repoCloneUrl) {
		const parsed = parseGitHubRemote(cloudProject.repoCloneUrl);
		if (parsed) {
			return {
				owner: parsed.owner,
				name: parsed.name,
				repoPath: local?.repoPath ?? null,
			};
		}
	}

	throw new TRPCError({
		code: "BAD_REQUEST",
		message: "Project has no resolvable GitHub repository",
	});
}
