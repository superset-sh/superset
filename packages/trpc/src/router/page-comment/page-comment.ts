import { db, dbWs } from "@superset/db/client";
import {
	pageComments,
	pageCommentThreads,
	pages,
	pageVersions,
	type SelectPage,
	users,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { protectedProcedure, userError } from "../../trpc";
import { assertPageReadable } from "../page/access";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	agentSessionFor,
	assertActivatedForAgent,
	shouldActivateOnWrite,
} from "./agent-access";
import {
	createPageCommentThreadSchema,
	deletePageCommentThreadSchema,
	type ElementAnchor,
	editPageCommentSchema,
	listPageCommentsSchema,
	replyPageCommentSchema,
	resolvePageCommentThreadSchema,
} from "./schema";

async function loadReadablePage({
	pageId,
	organizationId,
	userId,
}: {
	pageId: string;
	organizationId: string;
	userId: string;
}): Promise<SelectPage> {
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.organizationId, organizationId), eq(pages.id, pageId)))
		.limit(1);

	if (!page) {
		throw userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.pageComment.pageNotFound",
		});
	}
	assertPageReadable(page, userId);
	return page;
}

async function loadThread({
	threadId,
	organizationId,
	userId,
}: {
	threadId: string;
	organizationId: string;
	userId: string;
}) {
	const [row] = await db
		.select({ thread: pageCommentThreads, page: pages })
		.from(pageCommentThreads)
		.innerJoin(pages, eq(pages.id, pageCommentThreads.pageId))
		.where(
			and(
				eq(pageCommentThreads.id, threadId),
				eq(pages.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!row) {
		throw userError({
			code: "NOT_FOUND",
			message: "Thread not found",
			i18nKey: "serverError.pageComment.threadNotFound",
		});
	}
	assertPageReadable(row.page, userId);
	return row;
}

export const pageCommentRouter = {
	list: protectedProcedure
		.input(listPageCommentsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage({ pageId: input.pageId, organizationId, userId });

			const activatedOnly = ctx.agentCaller
				? true
				: (input.activatedOnly ?? false);

			const threadRows = await db
				.select({ thread: pageCommentThreads, version: pageVersions.version })
				.from(pageCommentThreads)
				.innerJoin(
					pageVersions,
					eq(pageVersions.id, pageCommentThreads.pageVersionId),
				)
				.where(
					and(
						eq(pageCommentThreads.pageId, input.pageId),
						activatedOnly
							? isNotNull(pageCommentThreads.agentActivatedAt)
							: undefined,
					),
				)
				.orderBy(asc(pageCommentThreads.createdAt));

			if (threadRows.length === 0) return [];

			const commentRows = await db
				.select({
					comment: pageComments,
					authorName: users.name,
					authorImage: users.image,
				})
				.from(pageComments)
				.innerJoin(
					pageCommentThreads,
					eq(pageCommentThreads.id, pageComments.threadId),
				)
				.leftJoin(users, eq(users.id, pageComments.authorUserId))
				.where(
					and(
						eq(pageCommentThreads.pageId, input.pageId),
						isNull(pageComments.deletedAt),
					),
				)
				.orderBy(asc(pageComments.createdAt));

			const byThread = new Map<string, typeof commentRows>();
			for (const row of commentRows) {
				const existing = byThread.get(row.comment.threadId);
				if (existing) existing.push(row);
				else byThread.set(row.comment.threadId, [row]);
			}

			return threadRows.map(({ thread, version }) => ({
				id: thread.id,
				anchorKind: thread.anchorKind,
				anchor: thread.anchor as ElementAnchor | null,
				anchorText: thread.anchorText,
				resolved: thread.resolvedAt !== null,
				createdAt: thread.createdAt,
				version,
				comments: (byThread.get(thread.id) ?? []).map((row) => ({
					id: row.comment.id,
					body: row.comment.body,
					authorKind: row.comment.authorKind,
					authorName: row.authorName ?? "Unknown",
					authorImage: row.authorImage ?? null,
					createdAt: row.comment.createdAt,
				})),
			}));
		}),

	create: protectedProcedure
		.input(createPageCommentThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await loadReadablePage({ pageId: input.pageId, organizationId, userId });

			const [version] = await db
				.select({ id: pageVersions.id })
				.from(pageVersions)
				.where(
					and(
						eq(pageVersions.pageId, input.pageId),
						eq(pageVersions.version, input.version),
					),
				)
				.limit(1);

			if (!version) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Version ${input.version} not found`,
				});
			}

			return await dbWs.transaction(async (tx) => {
				const [thread] = await tx
					.insert(pageCommentThreads)
					.values({
						pageId: input.pageId,
						pageVersionId: version.id,
						anchorKind: input.anchorKind,
						anchor: input.anchor,
						anchorText: input.anchorText,
						createdByUserId: userId,
						agentActivatedAt: new Date(),
						agentActivatedByUserId: userId,
					})
					.returning();

				if (!thread) {
					throw userError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create thread",
						i18nKey: "serverError.pageComment.failedToCreateThread",
					});
				}

				const [comment] = await tx
					.insert(pageComments)
					.values({
						threadId: thread.id,
						authorKind: "human",
						authorUserId: userId,
						body: input.body,
					})
					.returning();

				return { threadId: thread.id, commentId: comment?.id };
			});
		}),

	reply: protectedProcedure
		.input(replyPageCommentSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { thread } = await loadThread({
				threadId: input.threadId,
				organizationId,
				userId,
			});

			const agentSession = agentSessionFor(ctx, input.agentSessionId);
			assertActivatedForAgent(thread, agentSession);

			const [comment] = await db
				.insert(pageComments)
				.values({
					threadId: input.threadId,
					authorKind: agentSession ? "agent" : "human",
					authorUserId: userId,
					agentSessionId: agentSession,
					body: input.body,
				})
				.returning();

			if (shouldActivateOnWrite(thread, agentSession)) {
				await db
					.update(pageCommentThreads)
					.set({ agentActivatedAt: new Date(), agentActivatedByUserId: userId })
					.where(eq(pageCommentThreads.id, input.threadId));
			}

			return { id: comment?.id };
		}),

	edit: protectedProcedure
		.input(editPageCommentSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const [existing] = await db
				.select({ comment: pageComments, page: pages })
				.from(pageComments)
				.innerJoin(
					pageCommentThreads,
					eq(pageCommentThreads.id, pageComments.threadId),
				)
				.innerJoin(pages, eq(pages.id, pageCommentThreads.pageId))
				.where(
					and(
						eq(pageComments.id, input.commentId),
						eq(pages.organizationId, organizationId),
						isNull(pageComments.deletedAt),
					),
				)
				.limit(1);

			if (!existing) {
				throw userError({
					code: "NOT_FOUND",
					message: "Comment not found",
					i18nKey: "serverError.pageComment.commentNotFound",
				});
			}
			assertPageReadable(existing.page, userId);
			if (existing.comment.authorUserId !== userId) {
				throw userError({
					code: "FORBIDDEN",
					message: "Only the author can edit a comment",
					i18nKey: "serverError.pageComment.onlyTheAuthorCanEdit",
				});
			}

			await db
				.update(pageComments)
				.set({ body: input.body })
				.where(eq(pageComments.id, input.commentId));

			return { id: input.commentId };
		}),

	resolve: protectedProcedure
		.input(resolvePageCommentThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { thread } = await loadThread({
				threadId: input.threadId,
				organizationId,
				userId,
			});

			assertActivatedForAgent(thread, agentSessionFor(ctx));

			await db
				.update(pageCommentThreads)
				.set(
					input.resolved
						? { resolvedAt: new Date(), resolvedByUserId: userId }
						: { resolvedAt: null, resolvedByUserId: null },
				)
				.where(eq(pageCommentThreads.id, input.threadId));

			return { id: input.threadId, resolved: input.resolved };
		}),

	delete: protectedProcedure
		.input(deletePageCommentThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { thread, page } = await loadThread({
				threadId: input.threadId,
				organizationId,
				userId,
			});

			if (
				thread.createdByUserId !== userId &&
				page.createdByUserId !== userId
			) {
				throw userError({
					code: "FORBIDDEN",
					message: "Only the thread's author or the page's owner can delete it",
					i18nKey: "serverError.pageComment.onlyTheThreadSAuthor",
				});
			}

			await db
				.delete(pageCommentThreads)
				.where(eq(pageCommentThreads.id, input.threadId));

			return { id: input.threadId };
		}),
} satisfies TRPCRouterRecord;
