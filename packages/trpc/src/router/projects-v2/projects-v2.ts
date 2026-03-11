import { dbWs } from "@superset/db/client";
import { type SelectV2Project, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

function isUniqueViolation(
	error: unknown,
	constraintName?: string,
): error is { code: string; constraint?: string; constraint_name?: string } {
	if (
		typeof error !== "object" ||
		error === null ||
		!("code" in error) ||
		error.code !== "23505"
	) {
		return false;
	}

	if (!constraintName) {
		return true;
	}

	return (
		("constraint" in error && error.constraint === constraintName) ||
		("constraint_name" in error && error.constraint_name === constraintName)
	);
}

export const projectsV2Router = {
	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				slug: z.string().min(1),
				githubRepositoryId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			let project: SelectV2Project | undefined;

			try {
				[project] = await dbWs
					.insert(v2Projects)
					.values({
						organizationId: input.organizationId,
						name: input.name,
						slug: input.slug,
						githubRepositoryId: input.githubRepositoryId,
					})
					.returning();
			} catch (error) {
				if (isUniqueViolation(error, "v2_projects_org_slug_unique")) {
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"A V2 project with this slug already exists in the organization",
					});
				}

				throw error;
			}

			if (!project) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create V2 project",
				});
			}

			return project;
		}),

	rename: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				name: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const [project] = await dbWs
				.update(v2Projects)
				.set({ name: input.name })
				.where(
					and(
						eq(v2Projects.id, input.id),
						eq(v2Projects.organizationId, input.organizationId),
					),
				)
				.returning();

			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "V2 project not found",
				});
			}

			return project;
		}),

	delete: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			await dbWs
				.delete(v2Projects)
				.where(
					and(
						eq(v2Projects.id, input.id),
						eq(v2Projects.organizationId, input.organizationId),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
