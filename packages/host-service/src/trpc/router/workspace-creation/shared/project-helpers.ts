import { TRPCError } from "@trpc/server";
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

export async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<{ owner: string; name: string }> {
	const cloudProject = await ctx.api.v2Project.get.query({
		organizationId: ctx.organizationId,
		id: projectId,
	});
	const repo = cloudProject.githubRepository;
	if (!repo?.owner || !repo?.name) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project has no linked GitHub repository",
		});
	}
	return { owner: repo.owner, name: repo.name };
}
