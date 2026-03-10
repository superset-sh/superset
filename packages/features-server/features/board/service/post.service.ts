import { Injectable, Inject, NotFoundException, ForbiddenException } from "@nestjs/common";
import { eq, desc, and, sql, count } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { profiles } from "@superbuilder/drizzle";
import { boards, boardPosts, boardPostAttachments } from "@superbuilder/drizzle";
import type {
  CreatePostInput,
  UpdatePostInput,
  PostWithAuthor,
  PostDetail,
  PaginatedPosts,
} from "../types";

@Injectable()
export class PostService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * 게시글 목록 조회 (페이지네이션)
   */
  async findByBoardId(
    boardId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedPosts> {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    // 전체 개수 조회
    const totalResult = await this.db
      .select({ total: count() })
      .from(boardPosts)
      .where(
        and(
          eq(boardPosts.boardId, boardId),
          eq(boardPosts.status, "published")
        )
      );

    const total = totalResult[0]?.total ?? 0;

    // 게시글 목록 조회
    const posts = await this.db
      .select({
        id: boardPosts.id,
        boardId: boardPosts.boardId,
        authorId: boardPosts.authorId,
        title: boardPosts.title,
        content: boardPosts.content,
        status: boardPosts.status,
        viewCount: boardPosts.viewCount,
        likeCount: boardPosts.likeCount,
        commentCount: boardPosts.commentCount,
        isPinned: boardPosts.isPinned,
        isNotice: boardPosts.isNotice,
        createdAt: boardPosts.createdAt,
        updatedAt: boardPosts.updatedAt,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatar: profiles.avatar,
        },
      })
      .from(boardPosts)
      .innerJoin(profiles, eq(boardPosts.authorId, profiles.id))
      .where(
        and(
          eq(boardPosts.boardId, boardId),
          eq(boardPosts.status, "published")
        )
      )
      .orderBy(desc(boardPosts.isPinned), desc(boardPosts.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: posts as PostWithAuthor[],
      total,
      page,
      limit,
      hasMore: offset + posts.length < total,
    };
  }

  /**
   * 게시글 상세 조회
   */
  async findById(id: string): Promise<PostDetail | null> {
    const [post] = await this.db
      .select({
        id: boardPosts.id,
        boardId: boardPosts.boardId,
        authorId: boardPosts.authorId,
        title: boardPosts.title,
        content: boardPosts.content,
        status: boardPosts.status,
        viewCount: boardPosts.viewCount,
        likeCount: boardPosts.likeCount,
        commentCount: boardPosts.commentCount,
        isPinned: boardPosts.isPinned,
        isNotice: boardPosts.isNotice,
        createdAt: boardPosts.createdAt,
        updatedAt: boardPosts.updatedAt,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatar: profiles.avatar,
        },
      })
      .from(boardPosts)
      .innerJoin(profiles, eq(boardPosts.authorId, profiles.id))
      .where(eq(boardPosts.id, id))
      .limit(1);

    if (!post) return null;

    // 첨부파일 조회
    const attachments = await this.db
      .select()
      .from(boardPostAttachments)
      .where(eq(boardPostAttachments.postId, id))
      .orderBy(boardPostAttachments.order);

    // 게시판 정보 조회
    const [board] = await this.db
      .select({
        id: boards.id,
        name: boards.name,
        slug: boards.slug,
        type: boards.type,
      })
      .from(boards)
      .where(eq(boards.id, post.boardId))
      .limit(1);

    return {
      ...post,
      attachments,
      board: board ?? { id: post.boardId, name: "", slug: "", type: "general" as const },
    } as PostDetail;
  }

  /**
   * 게시글 생성
   */
  async create(input: CreatePostInput, authorId: string): Promise<PostWithAuthor> {
    const [created] = await this.db
      .insert(boardPosts)
      .values({
        boardId: input.boardId,
        authorId,
        title: input.title,
        content: input.content,
        status: input.status ?? "draft",
        isPinned: input.isPinned ?? false,
        isNotice: input.isNotice ?? false,
      })
      .returning();

    // 작성자 정보 조회
    const [author] = await this.db
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
      author,
    } as PostWithAuthor;
  }

  /**
   * 게시글 수정
   */
  async update(id: string, input: UpdatePostInput, userId: string): Promise<PostWithAuthor> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Post with id ${id} not found`);
    }

    // 본인 글만 수정 가능
    if (existing.authorId !== userId) {
      throw new ForbiddenException("You can only edit your own posts");
    }

    const [updated] = await this.db
      .update(boardPosts)
      .set({
        ...(input.title && { title: input.title }),
        ...(input.content && { content: input.content }),
        ...(input.status && { status: input.status }),
        ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
        ...(input.isNotice !== undefined && { isNotice: input.isNotice }),
      })
      .where(eq(boardPosts.id, id))
      .returning();

    return {
      ...updated,
      author: existing.author,
    } as PostWithAuthor;
  }

  /**
   * 게시글 삭제
   */
  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`Post with id ${id} not found`);
    }

    // 본인 글만 삭제 가능
    if (existing.authorId !== userId) {
      throw new ForbiddenException("You can only delete your own posts");
    }

    await this.db.delete(boardPosts).where(eq(boardPosts.id, id));
  }

  /**
   * 조회수 증가
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.db
      .update(boardPosts)
      .set({ viewCount: sql`${boardPosts.viewCount} + 1` })
      .where(eq(boardPosts.id, id));
  }
}
