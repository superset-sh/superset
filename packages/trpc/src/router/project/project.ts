import { dbWs } from "@superset/db/client";
import {
	githubRepositories,
	projects,
	sandboxImages,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgMembership } from "../integration/utils";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";
import { secretsRouter } from "./secrets";

async function getProjectAccess(
	userId: string,
	projectId: string,
	options?: {
		access?: "admin" | "member";
		organizationId?: string;
	},
) {
	return requireOrgResourceAccess(
		userId,
		() =>
			dbWs.query.projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(projects.id, projectId),
			}),
		{
			access: options?.access,
			message: options?.organizationId
				? "Project not found in this organization"
				: "Project not found",
			organizationId: options?.organizationId,
		},
	);
}

async function getScopedGithubRepository(
	organizationId: string,
	githubRepositoryId: string,
) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.githubRepositories.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(githubRepositories.id, githubRepositoryId),
			}),
		{
			code: "BAD_REQUEST",
			message: "GitHub repository not found in this organization",
			organizationId,
		},
	);
}

async function getScopedProject(organizationId: string, projectId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(projects.id, projectId),
			}),
		{
			message: "Project not found in this organization",
			organizationId,
		},
	);
}

export const projectRouter = {
	secrets: secretsRouter,

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				slug: z.string().min(1),
				repoOwner: z.string().min(1),
				repoName: z.string().min(1),
				repoUrl: z.string().url(),
				defaultBranch: z.string().optional(),
				githubRepositoryId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const githubRepository = input.githubRepositoryId
				? await getScopedGithubRepository(
						input.organizationId,
						input.githubRepositoryId,
					)
				: null;
			const [project] = await dbWs
				.insert(projects)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					slug: input.slug,
					repoOwner: input.repoOwner,
					repoName: input.repoName,
					repoUrl: input.repoUrl,
					defaultBranch: input.defaultBranch ?? "main",
					githubRepositoryId: githubRepository?.id,
				})
				.returning();
			if (!project) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create project",
				});
			}
			await dbWs.insert(sandboxImages).values({
				organizationId: input.organizationId,
				projectId: project.id,
			});
			return project;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				name: z.string().min(1).optional(),
				defaultBranch: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId: input.organizationId,
			});
			const data = {
				defaultBranch: input.defaultBranch,
				name: input.name,
			};
			if (
				Object.keys(data).every(
					(k) => data[k as keyof typeof data] === undefined,
				)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No fields to update",
				});
			}
			const [updated] = await dbWs
				.update(projects)
				.set(data)
				.where(eq(projects.id, project.id))
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.input(
			z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const project = await getScopedProject(input.organizationId, input.id);
			await dbWs.delete(projects).where(eq(projects.id, project.id));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
