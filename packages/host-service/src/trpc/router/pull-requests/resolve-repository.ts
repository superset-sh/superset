import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { resolveLocalRepo } from "../project/utils/resolve-repo";
import {
	projectNotSetupError,
	resolveGithubRepo,
} from "../workspace-creation/shared/project-helpers";

export async function resolvePullRequestRepository(
	ctx: HostServiceContext,
	projectId: string,
) {
	const project = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!project) throw projectNotSetupError(projectId);
	if (project.repoProvider !== "gitlab") {
		return {
			provider: "github" as const,
			host: "github.com",
			...(await resolveGithubRepo(ctx, projectId)),
		};
	}
	const resolved = await resolveLocalRepo(project.repoPath, {
		remoteName: project.remoteName ?? undefined,
		isConfiguredGitLabHost: async (host) => {
			try {
				await ctx.execGlab(["auth", "status", "--hostname", host]);
				return true;
			} catch {
				return false;
			}
		},
	});
	if (
		!project.remoteName ||
		resolved.remoteName !== project.remoteName ||
		resolved.parsed?.provider !== "gitlab"
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Configured GitLab remote is no longer available",
		});
	}
	return { ...resolved.parsed, repoPath: resolved.repoPath };
}
