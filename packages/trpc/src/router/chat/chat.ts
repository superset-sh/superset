import { db, dbWs } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { SUPERSET_CHAT_MODELS } from "@superset/shared/agent-models";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, userError } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

// Re-shaped from the canonical catalog in `@superset/shared/agent-models` so
// the chat API and the workspace-create model picker never drift.
const AVAILABLE_MODELS = SUPERSET_CHAT_MODELS.map((model) => ({
	id: model.id,
	name: model.label,
	provider: model.provider,
}));

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),

	listSessions: protectedProcedure
		.input(
			z
				.object({ sessionIds: z.array(z.uuid()).max(100).optional() })
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const sessionIds = input?.sessionIds;
			// Unfiltered reads are capped: sessions grow without bound and the
			// recent 200 covers every list surface; id-filtered reads (open
			// panes, run links) fetch exactly what they name.
			const query = db
				.select({
					id: chatSessions.id,
					title: chatSessions.title,
					workspaceId: chatSessions.workspaceId,
					v2WorkspaceId: chatSessions.v2WorkspaceId,
					organizationId: chatSessions.organizationId,
					createdBy: chatSessions.createdBy,
					createdAt: chatSessions.createdAt,
					lastActiveAt: chatSessions.lastActiveAt,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.organizationId, organizationId),
						sessionIds ? inArray(chatSessions.id, sessionIds) : undefined,
					),
				)
				.orderBy(desc(chatSessions.lastActiveAt));
			return sessionIds ? query : query.limit(200);
		}),

	createSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				v2WorkspaceId: z.uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw userError({
					code: "FORBIDDEN",
					message: "No active organization selected",
					i18nKey: "serverError.chat.noActiveOrganizationSelected",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(chatSessions)
					.values({
						id: input.sessionId,
						organizationId,
						createdBy: ctx.session.user.id,
						v2WorkspaceId: input.v2WorkspaceId,
					})
					.onConflictDoNothing()
					.returning({ id: chatSessions.id });

				if (!inserted) {
					return { txid: null };
				}

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return {
				sessionId: input.sessionId,
				txid: result.txid,
			};
		}),

	updateSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				title: z.string().optional(),
				lastActiveAt: z.date().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw userError({
					code: "FORBIDDEN",
					message: "No active organization selected",
					i18nKey: "serverError.chat.noActiveOrganizationSelected",
				});
			}

			const updates: Partial<typeof chatSessions.$inferInsert> = {};
			if (input.title !== undefined) {
				updates.title = input.title;
			}
			if (input.lastActiveAt !== undefined) {
				updates.lastActiveAt = input.lastActiveAt;
			}

			if (Object.keys(updates).length === 0) {
				return { updated: false };
			}

			const [updated] = await db
				.update(chatSessions)
				.set(updates)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),

	deleteSession: protectedProcedure
		.input(z.object({ sessionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw userError({
					code: "FORBIDDEN",
					message: "No active organization selected",
					i18nKey: "serverError.chat.noActiveOrganizationSelected",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [deleted] = await tx
					.delete(chatSessions)
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
						),
					)
					.returning({ id: chatSessions.id });

				if (!deleted) return { deleted, txid: null };
				const txid = await getCurrentTxid(tx);

				return { deleted, txid };
			});
			const { deleted, txid } = result;

			return { deleted: !!deleted, txid };
		}),

	updateTitle: protectedProcedure
		.input(z.object({ sessionId: z.uuid(), title: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(chatSessions)
				.set({ title: input.title })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),
} satisfies TRPCRouterRecord;
