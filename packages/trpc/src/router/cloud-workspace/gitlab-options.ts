import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { resolveGitlabClone } from "../../lib/gitlab/checkout";
import {
	gitlabBranchPage,
	gitlabProjectPage,
} from "../../lib/gitlab/cloud-options";
import {
	gitlabConnectionForOrg,
	gitlabCredentialsFor,
} from "../../lib/gitlab/connection";
import { gitlabScopeAllows } from "../../lib/gitlab/scope";
import { jwtProcedure, userError } from "../../trpc";

function reconnectGitlab() {
	return userError({
		code: "PRECONDITION_FAILED",
		message: "Reconnect GitLab to clone this project",
		i18nKey: "serverError.cloudWorkspace.reconnectGitLab",
	});
}

export const gitlabOptionsRouter = {
	listGitlabProjects: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				query: z.string().max(200).optional(),
				page: z.number().int().min(1).max(10000).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const connection = await gitlabConnectionForOrg(input.organizationId);
			if (!connection) return { items: [], nextPage: null };
			const credentials = await gitlabCredentialsFor(connection.id, {
				organizationId: input.organizationId,
			});
			if (
				!credentials ||
				credentials.organizationId !== input.organizationId ||
				credentials.connectionId !== connection.id
			)
				throw reconnectGitlab();
			return gitlabProjectPage(credentials, input);
		}),
	listGitlabBranches: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				cloneUrl: z.string().url(),
				query: z.string().max(200).optional(),
				page: z.number().int().min(1).max(10000).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const project = await resolveGitlabClone({
				organizationId: input.organizationId,
				cloneUrl: input.cloneUrl,
			});
			const credentials = await gitlabCredentialsFor(project.connectionId, {
				organizationId: input.organizationId,
				expected: {
					host: project.host,
					projectPath: project.pathWithNamespace,
				},
			});
			if (
				!credentials ||
				credentials.organizationId !== input.organizationId ||
				credentials.connectionId !== project.connectionId ||
				credentials.config.host !== project.host ||
				!gitlabScopeAllows(credentials.config, project.pathWithNamespace)
			)
				throw reconnectGitlab();
			return gitlabBranchPage(credentials, {
				...input,
				projectPath: project.pathWithNamespace,
				defaultBranch: project.defaultBranch,
			});
		}),
} satisfies TRPCRouterRecord;
