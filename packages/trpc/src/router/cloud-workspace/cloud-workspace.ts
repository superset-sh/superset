import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import {
	createCloudWorkspaceSchema,
	listCloudWorkspacesSchema,
	updateCloudWorkspaceSchema,
} from "./schema";

function getOrganizationId(ctx: { session: { session: { activeOrganizationId: string | null } } }) {
	const organizationId = ctx.session.session.activeOrganizationId;
	if (!organizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No active organization selected",
		});
	}
	return organizationId;
}

export const cloudWorkspaceRouter = {
	list: protectedProcedure
		.input(listCloudWorkspacesSchema.optional())
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				return [];
			}

			const { status, repositoryId, limit = 50, offset = 0 } = input ?? {};

			const conditions = [
				eq(cloudWorkspaces.organizationId, organizationId),
				ne(cloudWorkspaces.status, "archived"),
			];

			if (status) {
				conditions.push(eq(cloudWorkspaces.status, status));
			}

			if (repositoryId) {
				conditions.push(eq(cloudWorkspaces.repositoryId, repositoryId));
			}

			return db
				.select()
				.from(cloudWorkspaces)
				.where(and(...conditions))
				.orderBy(desc(cloudWorkspaces.updatedAt))
				.limit(limit)
				.offset(offset);
		}),

	listArchived: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().int().positive().max(100).default(50),
					offset: z.number().int().min(0).default(0),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				return [];
			}

			const { limit = 50, offset = 0 } = input ?? {};

			return db
				.select()
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, organizationId),
						eq(cloudWorkspaces.status, "archived"),
					),
				)
				.orderBy(desc(cloudWorkspaces.archivedAt))
				.limit(limit)
				.offset(offset);
		}),

	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.id, input.id),
						eq(cloudWorkspaces.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			return workspace;
		}),

	getBySessionId: protectedProcedure
		.input(z.object({ sessionId: z.string() }))
		.query(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.sessionId, input.sessionId),
						eq(cloudWorkspaces.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			return workspace;
		}),

	create: protectedProcedure
		.input(createCloudWorkspaceSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			const sessionId = crypto.randomUUID();
			const branch =
				input.branch ?? `superset/${ctx.session.user.id.slice(0, 8)}/${sessionId.slice(0, 8)}`;

			const [workspace] = await db
				.insert(cloudWorkspaces)
				.values({
					organizationId,
					userId: ctx.session.user.id,
					sessionId,
					title: input.title,
					repositoryId: input.repositoryId,
					repoOwner: input.repoOwner,
					repoName: input.repoName,
					branch,
					baseBranch: input.baseBranch,
					model: input.model,
					linearIssueId: input.linearIssueId,
					linearIssueKey: input.linearIssueKey,
				})
				.returning();

			// TODO: Call control plane to initialize session with initial prompt
			// if (input.initialPrompt) {
			//   await initializeCloudSession(workspace.sessionId, input.initialPrompt);
			// }

			return workspace;
		}),

	update: protectedProcedure
		.input(updateCloudWorkspaceSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);
			const { id, ...data } = input;

			const [workspace] = await db
				.update(cloudWorkspaces)
				.set({
					...data,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(cloudWorkspaces.id, id),
						eq(cloudWorkspaces.organizationId, organizationId),
					),
				)
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			return workspace;
		}),

	archive: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			const [workspace] = await db
				.update(cloudWorkspaces)
				.set({
					status: "archived",
					archivedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(cloudWorkspaces.id, input.id),
						eq(cloudWorkspaces.organizationId, organizationId),
					),
				)
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			// TODO: Call control plane to stop sandbox and cleanup
			// await terminateCloudSession(workspace.sessionId);

			return workspace;
		}),

	unarchive: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			const [workspace] = await db
				.update(cloudWorkspaces)
				.set({
					status: "created",
					archivedAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(cloudWorkspaces.id, input.id),
						eq(cloudWorkspaces.organizationId, organizationId),
						eq(cloudWorkspaces.status, "archived"),
					),
				)
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found or not archived",
				});
			}

			return workspace;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			// Only allow deleting archived workspaces
			const [workspace] = await db
				.delete(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.id, input.id),
						eq(cloudWorkspaces.organizationId, organizationId),
						eq(cloudWorkspaces.status, "archived"),
					),
				)
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found or must be archived before deletion",
				});
			}

			return { success: true };
		}),

	// Update sandbox status (called by control plane webhook or polling)
	updateSandboxStatus: protectedProcedure
		.input(
			z.object({
				sessionId: z.string(),
				sandboxStatus: z.enum([
					"pending",
					"warming",
					"syncing",
					"ready",
					"running",
					"stopped",
					"failed",
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(ctx);

			const [workspace] = await db
				.update(cloudWorkspaces)
				.set({
					sandboxStatus: input.sandboxStatus,
					lastActivityAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(cloudWorkspaces.sessionId, input.sessionId),
						eq(cloudWorkspaces.organizationId, organizationId),
					),
				)
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			return workspace;
		}),
} satisfies TRPCRouterRecord;
