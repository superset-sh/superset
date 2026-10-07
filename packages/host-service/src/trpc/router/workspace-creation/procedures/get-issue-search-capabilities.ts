import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveSearchTargets } from "../shared/gitlab-search-caller";

export interface IssueSearchCapability {
	projectId: string;
	provider: "github" | "gitlab" | null;
	host?: string;
	projectPath?: string;
	error?: { code: TRPCError["code"]; message: string };
}
export const getIssueSearchCapabilities = protectedProcedure
	.input(z.object({ projectIds: z.array(z.string().min(1)).min(1).max(100) }))
	.query(async ({ ctx, input }): Promise<IssueSearchCapability[]> => {
		const projectIds = [...new Set(input.projectIds)];
		const results: IssueSearchCapability[] = [];
		let index = 0;
		await Promise.all(
			Array.from({ length: Math.min(4, projectIds.length) }, async () => {
				while (index < projectIds.length) {
					const i = index++;
					const projectId = projectIds[i];
					if (projectId === undefined) continue;
					try {
						const target = (
							await resolveSearchTargets(ctx, [projectId], false)
						)[0];
						if (
							!target ||
							(target.repo.provider !== "github" &&
								target.repo.provider !== "gitlab")
						)
							throw new TRPCError({
								code: "PRECONDITION_FAILED",
								message: "Repository issue search metadata is unavailable.",
							});
						results[i] = {
							projectId,
							provider: target.repo.provider,
							host: target.repo.host,
							projectPath: `${target.repo.owner}/${target.repo.name}`,
						};
					} catch (error) {
						results[i] = {
							projectId,
							provider: null,
							error: {
								code:
									error instanceof TRPCError
										? error.code
										: "SERVICE_UNAVAILABLE",
								message:
									"Repository issue search metadata could not be resolved on this host.",
							},
						};
					}
				}
			}),
		);
		return results;
	});
