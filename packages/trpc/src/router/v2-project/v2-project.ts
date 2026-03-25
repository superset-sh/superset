import { dbWs } from "@superset/db/client";
import { githubRepositories, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import {
	requireActiveOrgId,
	requireActiveOrgMembership,
} from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";

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
			dbWs.query.v2Projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Projects.id, projectId),
			}),
		{
			message: "Project not found in this organization",
			organizationId,
		},
	);
}

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
			dbWs.query.v2Projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Projects.id, projectId),
			}),
		{
			access: options?.access,
			message: "Project not found",
			organizationId: options?.organizationId,
		},
	);
}

export const v2ProjectRouter = {
	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(
				ctx.session,
				"No active organization",
			);
			const row = await requireOrgResourceAccess(
				ctx.session.user.id,
				() =>
					dbWs.query.v2Projects.findFirst({
						where: eq(v2Projects.id, input.id),
						with: { githubRepository: true },
					}),
				{
					message: "Project not found",
					organizationId,
				},
			);
			const repoCloneUrl = row.githubRepository
				? `https://github.com/${row.githubRepository.fullName}.git`
				: null;
			return { ...row, repoCloneUrl };
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				slug: z.string().min(1),
				githubRepositoryId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(
				ctx.session,
				"No active organization",
			);

			const repo = await getScopedGithubRepository(
				organizationId,
				input.githubRepositoryId,
			);

			const [project] = await dbWs
				.insert(v2Projects)
				.values({
					organizationId,
					name: input.name,
					slug: input.slug,
					githubRepositoryId: repo.id,
				})
				.returning();
			if (!project) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create project",
				});
			}
			return project;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				slug: z.string().min(1).optional(),
				githubRepositoryId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(
				ctx.session,
				"No active organization",
			);
			const project = await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId,
			});

			if (input.githubRepositoryId) {
				await getScopedGithubRepository(
					project.organizationId,
					input.githubRepositoryId,
				);
			}

			const data = {
				githubRepositoryId: input.githubRepositoryId,
				name: input.name,
				slug: input.slug,
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
				.update(v2Projects)
				.set(data)
				.where(eq(v2Projects.id, project.id))
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(
				ctx.session,
				"No active organization",
			);
			const project = await getScopedProject(organizationId, input.id);
			await dbWs.delete(v2Projects).where(eq(v2Projects.id, project.id));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
