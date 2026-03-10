import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { eq, desc, and, sql, count } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { comments, type Comment } from "@superbuilder/drizzle";

export interface CommentWithAuthor extends Comment {
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
  replyCount?: number;
}

export interface PaginatedComments {
  items: CommentWithAuthor[];
  total: number;
  hasMore: boolean;
}

export interface CreateCommentInput {
  targetType: "board_post" | "community_post" | "blog_post" | "page";
  targetId: string;
  content: string;
  parentId?: string;
  mentions?: string[];
}

export interface UpdateCommentInput {
  content: string;
  mentions?: string[];
}

export interface CommentQueryInput {
  targetType: "board_post" | "community_post" | "blog_post" | "page";
  targetId: string;
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

@Injectable()
export class CommentService {
  private readonly MAX_DEPTH = 2;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  async findByTarget(input: CommentQueryInput): Promise<PaginatedComments> {
    const { targetType, targetId, page = 1, limit = 20, sortOrder = "desc" } = input;
    const offset = (page - 1) * limit;

    const whereCondition = and(
      eq(comments.targetType, targetType),
      eq(comments.targetId, targetId),
      eq(comments.status, "visible"),
      sql`${comments.parentId} IS NULL`
    );

    const data = await this.db
      .select()
      .from(comments)
      .where(whereCondition)
      .limit(limit + 1)
      .offset(offset)
      .orderBy(sortOrder === "asc" ? comments.createdAt : desc(comments.createdAt));

    const totalResult = await this.db
      .select({ count: count() })
      .from(comments)
      .where(whereCondition);

    const hasMore = data.length > limit;
    const items = hasMore ? data.slice(0, limit) : data;

    return {
      items: items as CommentWithAuthor[],
      total: totalResult[0]?.count ?? 0,
      hasMore,
    };
  }

  async findReplies(parentId: string, limit = 20): Promise<CommentWithAuthor[]> {
    const data = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.parentId, parentId),
          eq(comments.status, "visible")
        )
      )
      .limit(limit)
      .orderBy(comments.createdAt);

    return data as CommentWithAuthor[];
  }

  async findById(id: string): Promise<Comment | null> {
    const [result] = await this.db
      .select()
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);

    return result ?? null;
  }

  async create(input: CreateCommentInput, authorId: string): Promise<Comment> {
    const { targetType, targetId, content, parentId, mentions } = input;

    let depth = 0;

    if (parentId) {
      const parent = await this.findById(parentId);
      if (!parent) {
        throw new NotFoundException("부모 댓글을 찾을 수 없습니다");
      }
      if (parent.status !== "visible") {
        throw new BadRequestException("삭제되거나 숨겨진 댓글에는 답글을 달 수 없습니다");
      }
      if (parent.depth >= this.MAX_DEPTH - 1) {
        throw new BadRequestException(`대댓글 깊이는 최대 ${this.MAX_DEPTH - 1}단계까지 가능합니다`);
      }
      depth = parent.depth + 1;
    }

    const [comment] = await this.db
      .insert(comments)
      .values({
        targetType,
        targetId,
        content,
        authorId,
        parentId: parentId ?? null,
        depth,
        mentions: mentions ?? [],
        status: "visible",
      })
      .returning();

    if (!comment) {
      throw new InternalServerErrorException("댓글 생성에 실패했습니다");
    }

    return comment;
  }

  async update(id: string, input: UpdateCommentInput, userId: string): Promise<Comment> {
    const comment = await this.findById(id);

    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("본인이 작성한 댓글만 수정할 수 있습니다");
    }

    const [updated] = await this.db
      .update(comments)
      .set({
        content: input.content,
        mentions: input.mentions ?? comment.mentions,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Comment with id ${id} not found`);
    }

    return updated;
  }

  async delete(id: string, userId: string, isAdmin = false): Promise<{ success: boolean }> {
    const comment = await this.findById(id);

    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다");
    }

    if (!isAdmin && comment.authorId !== userId) {
      throw new ForbiddenException("본인이 작성한 댓글만 삭제할 수 있습니다");
    }

    await this.db
      .update(comments)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(comments.id, id));

    return { success: true };
  }

  async getCount(targetType: string, targetId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(
        and(
          eq(comments.targetType, targetType as typeof comments.targetType.enumValues[number]),
          eq(comments.targetId, targetId),
          eq(comments.status, "visible")
        )
      );

    return result[0]?.count ?? 0;
  }
}
