import { dbWs } from "@superset/db/client";
import { githubRepositories, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

export const v2ProjectRouter = {
	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgMembership(ctx.session.user.id, organizationId);

			const row = await dbWs.query.v2Projects.findFirst({
				where: and(
					eq(v2Projects.id, input.id),
					eq(v2Projects.organizationId, organizationId),
				),
				with: { githubRepository: true },
			});
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
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
				githubRepositoryId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgMembership(ctx.session.user.id, organizationId);

			if (input.githubRepositoryId) {
				const repo = await dbWs.query.githubRepositories.findFirst({
					where: and(
						eq(githubRepositories.id, input.githubRepositoryId),
						eq(githubRepositories.organizationId, organizationId),
					),
				});
				if (!repo) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "GitHub repository not found in this organization",
					});
				}
			}

			const [project] = await dbWs
				.insert(v2Projects)
				.values({
					organizationId,
					name: input.name,
					slug: input.slug,
					githubRepositoryId: input.githubRepositoryId,
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
				githubRepositoryId: z.string().uuid().nullish(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgMembership(ctx.session.user.id, organizationId);

			if (input.githubRepositoryId) {
				const repo = await dbWs.query.githubRepositories.findFirst({
					where: and(
						eq(githubRepositories.id, input.githubRepositoryId),
						eq(githubRepositories.organizationId, organizationId),
					),
				});
				if (!repo) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "GitHub repository not found in this organization",
					});
				}
			}

			const { id, ...data } = input;
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
				.where(
					and(
						eq(v2Projects.id, id),
						eq(v2Projects.organizationId, organizationId),
					),
				)
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
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await dbWs
				.delete(v2Projects)
				.where(
					and(
						eq(v2Projects.id, input.id),
						eq(v2Projects.organizationId, organizationId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
