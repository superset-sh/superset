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
import { verifyOrgMembership } from "../integration/utils";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";

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
			code: "BAD_REQUEST",
			message: "Project not found in this organization",
			organizationId,
		},
	);
}

async function getWorkspaceAccess(
	userId: string,
	workspaceId: string,
	options?: {
		access?: "admin" | "member";
		organizationId?: string;
	},
) {
	return requireOrgResourceAccess(
		userId,
		() =>
			dbWs.query.workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(workspaces.id, workspaceId),
			}),
		{
			access: options?.access,
			message: options?.organizationId
				? "Workspace not found in this organization"
				: "Workspace not found",
			organizationId: options?.organizationId,
		},
	);
}

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
			const project = await getScopedProject(
				input.organizationId,
				input.projectId,
			);
			const [workspace] = await dbWs
				.insert(workspaces)
				.values({
					projectId: project.id,
					organizationId: project.organizationId,
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
			const workspace = await getWorkspaceAccess(
				ctx.session.user.id,
				input.id,
				{
					access: "admin",
					organizationId: input.organizationId,
				},
			);
			await dbWs.delete(workspaces).where(eq(workspaces.id, workspace.id));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
