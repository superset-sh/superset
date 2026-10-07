import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gitLabApiDeps } from "../../../../runtime/git/gitlab-api";
import {
	encodeProjectPath,
	GitLabRestError,
	gitlabRest,
} from "../../../../runtime/repo-providers/gitlab/gitlab-rest";
import { protectedProcedure } from "../../../index";
import {
	gitLabSearchError,
	resolveSearchTargets,
} from "../shared/gitlab-search-caller";

const approvalRulesSchema = z
	.array(
		z.object({
			id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
			approvals_required: z.number().int().nonnegative(),
		}),
	)
	.max(100);

export interface PullRequestSearchCapability {
	projectId: string;
	provider: "github" | "gitlab" | null;
	host?: string;
	projectPath?: string;
	reviewSemantics?: "history" | "current-cycle";
	teamReviewRequests?: boolean;
	approvalRules: "available" | "unavailable" | "unknown";
	error?: { code: TRPCError["code"]; message: string };
}

export const getPullRequestSearchCapabilities = protectedProcedure
	.input(z.object({ projectIds: z.array(z.string().min(1)).min(1).max(100) }))
	.query(async ({ ctx, input }): Promise<PullRequestSearchCapability[]> => {
		const projectIds = [...new Set(input.projectIds)];
		const results: PullRequestSearchCapability[] = [];
		let index = 0;
		await Promise.all(
			Array.from({ length: Math.min(4, projectIds.length) }, async () => {
				while (index < projectIds.length) {
					const i = index++;
					const projectId = projectIds[i];
					if (projectId === undefined) continue;
					let result: PullRequestSearchCapability = {
						projectId,
						provider: null,
						approvalRules: "unknown",
					};
					try {
						const target = (
							await resolveSearchTargets(ctx, [projectId], false)
						)[0];
						if (!target)
							throw new TRPCError({
								code: "NOT_FOUND",
								message: "Project search capabilities are unavailable.",
							});
						const repo = target.repo;
						if (repo.provider !== "github" && repo.provider !== "gitlab")
							throw new TRPCError({
								code: "PRECONDITION_FAILED",
								message: "Project search capabilities are unavailable.",
							});
						result = {
							projectId,
							provider: repo.provider,
							host: repo.host,
							projectPath: `${repo.owner}/${repo.name}`,
							reviewSemantics:
								repo.provider === "gitlab" ? "current-cycle" : "history",
							teamReviewRequests: repo.provider === "github",
							approvalRules:
								repo.provider === "github" ? "available" : "unknown",
						};
						if (repo.provider === "gitlab") {
							try {
								const deps = gitLabApiDeps(ctx.credentials, repo);
								const token = deps.request ? null : await deps.token();
								if (!deps.request && !token)
									throw new TRPCError({
										code: "PRECONDITION_FAILED",
										message: `No GitLab credentials are available for ${repo.host}.`,
									});
								const rules = await gitlabRest<unknown>(
									{ ...deps, token: async () => token },
									`/projects/${encodeProjectPath(repo.owner, repo.name)}/approval_rules`,
									{ per_page: 1 },
								);
								if (!approvalRulesSchema.safeParse(rules).success)
									throw new GitLabRestError(
										502,
										"Invalid GitLab approval rule metadata",
									);
								result.approvalRules = "available";
							} catch (error) {
								if (error instanceof GitLabRestError && error.status === 404)
									result.approvalRules = "unavailable";
								else {
									const failure = gitLabSearchError(error, repo);
									result.error = {
										code: failure.code,
										message: failure.message,
									};
								}
							}
						}
					} catch (error) {
						result.error = {
							code:
								error instanceof TRPCError ? error.code : "SERVICE_UNAVAILABLE",
							message:
								"Project search capabilities could not be resolved on this host.",
						};
					}
					results[i] = result;
				}
			}),
		);
		return results;
	});
