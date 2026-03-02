import { dbWs } from "@superset/db/client";
import { projects, sandboxImages } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";
import { secretsRouter } from "./secrets";

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
					githubRepositoryId: input.githubRepositoryId,
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
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const { id, organizationId, ...data } = input;
			const [updated] = await dbWs
				.update(projects)
				.set(data)
				.where(
					and(eq(projects.id, id), eq(projects.organizationId, organizationId)),
				)
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.input(
			z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			await dbWs
				.delete(projects)
				.where(
					and(
						eq(projects.id, input.id),
						eq(projects.organizationId, input.organizationId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
