import { dbWs } from "@superset/db/client";
import {
	projects,
	workspaceConfigSchema,
	workspaces,
	workspaceTypeEnum,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

export const workspaceRouter = {
	ensure: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				project: z.object({
					name: z.string().min(1),
					slug: z.string().min(1),
					repoOwner: z.string().min(1),
					repoName: z.string().min(1),
					repoUrl: z.string().url(),
					defaultBranch: z.string().default("main"),
				}),
				workspace: z.object({
					id: z.string().uuid(),
					name: z.string().min(1),
					type: workspaceTypeEnum,
					config: workspaceConfigSchema,
				}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const result = await dbWs.transaction(async (tx) => {
				// Upsert project by (organizationId, slug) unique constraint
				const [upsertedProject] = await tx
					.insert(projects)
					.values({
						organizationId: input.organizationId,
						name: input.project.name,
						slug: input.project.slug,
						repoOwner: input.project.repoOwner,
						repoName: input.project.repoName,
						repoUrl: input.project.repoUrl,
						defaultBranch: input.project.defaultBranch,
					})
					.onConflictDoNothing({
						target: [projects.organizationId, projects.slug],
					})
					.returning();

				// If conflict, SELECT existing project
				const projectRow =
					upsertedProject ??
					(await tx
						.select()
						.from(projects)
						.where(
							and(
								eq(projects.organizationId, input.organizationId),
								eq(projects.slug, input.project.slug),
							),
						)
						.then((rows) => rows[0]));

				if (!projectRow) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to ensure project",
					});
				}

				// Upsert workspace by id
				await tx
					.insert(workspaces)
					.values({
						id: input.workspace.id,
						organizationId: input.organizationId,
						projectId: projectRow.id,
						name: input.workspace.name,
						type: input.workspace.type,
						config: input.workspace.config,
						createdByUserId: ctx.session.user.id,
					})
					.onConflictDoNothing({ target: [workspaces.id] });

				const txid = await getCurrentTxid(tx);
				return {
					projectId: projectRow.id,
					workspaceId: input.workspace.id,
					txid,
				};
			});

			return result;
		}),

	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				type: workspaceTypeEnum,
				config: workspaceConfigSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const [workspace] = await dbWs
				.insert(workspaces)
				.values({
					projectId: input.projectId,
					organizationId: input.organizationId,
					name: input.name,
					type: input.type,
					config: input.config,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return workspace;
		}),

	delete: protectedProcedure
		.input(
			z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			await dbWs
				.delete(workspaces)
				.where(
					and(
						eq(workspaces.id, input.id),
						eq(workspaces.organizationId, input.organizationId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
