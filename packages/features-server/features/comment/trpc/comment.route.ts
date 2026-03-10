/**
 * Comment Feature - tRPC Router
 */

import { NotFoundException, BadRequestException } from "@nestjs/common";
import { profiles } from "@superbuilder/drizzle";
import { publicProcedure, protectedProcedure, router } from "../../../core/trpc";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { comments, commentTargetType } from "@superbuilder/drizzle";

// Comment target type values from schema enum
const commentTargetTypes = commentTargetType.enumValues;

// Input schemas
const targetSchema = z.object({
  targetType: z.enum(commentTargetTypes),
  targetId: z.string().uuid(),
});

const createCommentSchema = z.object({
  targetType: z.enum(commentTargetTypes),
  targetId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  mentions: z.array(z.string().uuid()).optional(),
});

const paginationSchema = z.object({
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
});

export const commentRouter = router({
  /**
   * 댓글 목록 조회 (타겟별)
   */
  list: publicProcedure
    .input(
      z.object({
        ...targetSchema.shape,
        ...paginationSchema.shape,
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { targetType, targetId, page, limit } = input;
      const pageNum = page ?? 1;
      const limitNum = limit ?? 20;
      const offset = (pageNum - 1) * limitNum;

      // 전체 개수 (최상위 댓글만)
      const [countResult] = await db
        .select({ total: count() })
        .from(comments)
        .where(
          and(
            eq(comments.targetType, targetType),
            eq(comments.targetId, targetId),
            isNull(comments.parentId),
            eq(comments.status, "visible"),
          ),
        );

      const total = countResult?.total ?? 0;

      // 최상위 댓글 조회
      const rootComments = await db
        .select({
          id: comments.id,
          content: comments.content,
          authorId: comments.authorId,
          targetType: comments.targetType,
          targetId: comments.targetId,
          parentId: comments.parentId,
          depth: comments.depth,
          status: comments.status,
          mentions: comments.mentions,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
          author: {
            id: profiles.id,
            name: profiles.name,
            avatar: profiles.avatar,
          },
        })
        .from(comments)
        .innerJoin(profiles, eq(comments.authorId, profiles.id))
        .where(
          and(
            eq(comments.targetType, targetType),
            eq(comments.targetId, targetId),
            isNull(comments.parentId),
            eq(comments.status, "visible"),
          ),
        )
        .orderBy(asc(comments.createdAt))
        .limit(limitNum)
        .offset(offset);

      return {
        items: rootComments,
        total,
        page: pageNum,
        limit: limitNum,
        hasMore: offset + rootComments.length < total,
      };
    }),

  /**
   * 대댓글 조회
   */
  getReplies: publicProcedure
    .input(
      z.object({
        parentId: z.string().uuid(),
        ...paginationSchema.shape,
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { parentId, page, limit } = input;
      const pageNum = page ?? 1;
      const limitNum = limit ?? 20;
      const offset = (pageNum - 1) * limitNum;

      // 전체 개수
      const [countResult] = await db
        .select({ total: count() })
        .from(comments)
        .where(and(eq(comments.parentId, parentId), eq(comments.status, "visible")));

      const total = countResult?.total ?? 0;

      // 대댓글 조회
      const replies = await db
        .select({
          id: comments.id,
          content: comments.content,
          authorId: comments.authorId,
          targetType: comments.targetType,
          targetId: comments.targetId,
          parentId: comments.parentId,
          depth: comments.depth,
          status: comments.status,
          mentions: comments.mentions,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
          author: {
            id: profiles.id,
            name: profiles.name,
            avatar: profiles.avatar,
          },
        })
        .from(comments)
        .innerJoin(profiles, eq(comments.authorId, profiles.id))
        .where(and(eq(comments.parentId, parentId), eq(comments.status, "visible")))
        .orderBy(asc(comments.createdAt))
        .limit(limitNum)
        .offset(offset);

      return {
        items: replies,
        total,
        page: pageNum,
        limit: limitNum,
        hasMore: offset + replies.length < total,
      };
    }),

  /**
   * 댓글 상세 조회
   */
  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = ctx.db;

    const [comment] = await db
      .select({
        id: comments.id,
        content: comments.content,
        authorId: comments.authorId,
        targetType: comments.targetType,
        targetId: comments.targetId,
        parentId: comments.parentId,
        depth: comments.depth,
        status: comments.status,
        mentions: comments.mentions,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatar: profiles.avatar,
        },
      })
      .from(comments)
      .innerJoin(profiles, eq(comments.authorId, profiles.id))
      .where(eq(comments.id, input.id))
      .limit(1);

    if (!comment) {
      throw new NotFoundException(`댓글을 찾을 수 없습니다: ${input.id}`);
    }

    return comment;
  }),

  /**
   * 댓글 생성
   */
  create: protectedProcedure
    .input(createCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const authorId = ctx.user!.id;

      let depth = 0;
      const parentId = input.parentId ?? null;

      // 대댓글인 경우 부모 댓글의 depth 확인
      if (parentId) {
        const [parent] = await db
          .select({ depth: comments.depth })
          .from(comments)
          .where(eq(comments.id, parentId))
          .limit(1);

        if (!parent) {
          throw new NotFoundException("부모 댓글을 찾을 수 없습니다");
        }

        depth = parent.depth + 1;

        // 최대 깊이 제한 (2단계)
        if (depth > 2) {
          throw new BadRequestException("최대 답글 깊이를 초과했습니다");
        }
      }

      const [created] = await db
        .insert(comments)
        .values({
          content: input.content,
          authorId,
          targetType: input.targetType,
          targetId: input.targetId,
          parentId,
          depth,
          mentions: input.mentions ?? [],
        })
        .returning();

      // 작성자 정보 조회
      const [author] = await db
        .select({
          id: profiles.id,
          name: profiles.name,
          avatar: profiles.avatar,
        })
        .from(profiles)
        .where(eq(profiles.id, authorId))
        .limit(1);

      return {
        ...created,
        author: author ?? { id: authorId, name: "Unknown", avatar: null },
      };
    }),

  /**
   * 댓글 수정
   */
  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: updateCommentSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      const [updated] = await db
        .update(comments)
        .set({
          content: input.data.content,
          mentions: input.data.mentions,
          updatedAt: new Date(),
        })
        .where(eq(comments.id, input.id))
        .returning();

      if (!updated) {
        throw new NotFoundException(`댓글을 찾을 수 없습니다: ${input.id}`);
      }

      return updated;
    }),

  /**
   * 댓글 삭제 (소프트 삭제)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      // 대댓글이 있는지 확인
      const [countResult] = await db
        .select({ replyCount: count() })
        .from(comments)
        .where(eq(comments.parentId, input.id));

      const replyCount = countResult?.replyCount ?? 0;

      if (replyCount > 0) {
        // 대댓글이 있으면 소프트 삭제 (상태만 변경)
        await db
          .update(comments)
          .set({ status: "deleted", updatedAt: new Date() })
          .where(eq(comments.id, input.id));
      } else {
        // 대댓글이 없으면 실제 삭제
        await db.delete(comments).where(eq(comments.id, input.id));
      }

      return { success: true };
    }),

  /**
   * 댓글 개수 조회
   */
  count: publicProcedure.input(targetSchema).query(async ({ ctx, input }) => {
    const db = ctx.db;

    const [countResult] = await db
      .select({ total: count() })
      .from(comments)
      .where(
        and(
          eq(comments.targetType, input.targetType),
          eq(comments.targetId, input.targetId),
          eq(comments.status, "visible"),
        ),
      );

    return { count: countResult?.total ?? 0 };
  }),
});

export type CommentRouter = typeof commentRouter;
