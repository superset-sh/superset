import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { eq, desc, and, asc, sql, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { decodeCursor, buildCursorResult } from "../../../shared/utils/pagination";
import {
  communityComments,
  communityPosts,
  profiles,
  type CommunityComment,
} from "@superbuilder/drizzle";
import type { CreateCommentDto } from "../dto";
import { CommunityService } from "./community.service";
import { assertCommunityPermission } from "../helpers/permission";

export interface CommentListOptions {
  postId: string;
  sort?: "old" | "new";
  cursor?: string;
  limit?: number;
}

@Injectable()
export class CommunityCommentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
    private readonly communityService: CommunityService
  ) {}

  /**
   * 댓글 생성
   */
  async create(dto: CreateCommentDto, userId: string): Promise<CommunityComment> {
    // 게시물 확인
    const [post] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, dto.postId))
      .limit(1);

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    if (post.isLocked) {
      throw new ForbiddenException("잠긴 게시글에는 댓글을 작성할 수 없습니다.");
    }

    // Depth 계산
    let depth = 0;
    if (dto.parentId) {
      const parent = await this.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException("상위 댓글을 찾을 수 없습니다.");
      }
      depth = parent.depth + 1;
    }

    // 댓글 생성
    const [comment] = await this.db
      .insert(communityComments)
      .values({
        ...dto,
        authorId: userId,
        depth,
      })
      .returning();

    // 게시물 댓글 수 증가
    await this.db
      .update(communityPosts)
      .set({
        commentCount: sql`${communityPosts.commentCount} + 1`,
        lastActivityAt: new Date(),
      })
      .where(eq(communityPosts.id, dto.postId));

    // 부모 댓글의 reply_count 증가
    if (dto.parentId) {
      await this.db
        .update(communityComments)
        .set({
          replyCount: sql`${communityComments.replyCount} + 1`,
        })
        .where(eq(communityComments.id, dto.parentId));
    }

    return comment as CommunityComment;
  }

  /**
   * 게시물의 댓글 목록 조회 (cursor pagination)
   */
  async findByPost(options: CommentListOptions) {
    const limit = options.limit ?? 50;

    const conditions: any[] = [
      eq(communityComments.postId, options.postId),
    ];

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        if (options.sort === "new") {
          conditions.push(
            sql`(${communityComments.createdAt}, ${communityComments.id}) < (${decoded.value}, ${decoded.id})`
          );
        } else {
          // "old" (default) - ascending
          conditions.push(
            sql`(${communityComments.createdAt}, ${communityComments.id}) > (${decoded.value}, ${decoded.id})`
          );
        }
      }
    }

    let query = this.db
      .select()
      .from(communityComments)
      .where(and(...conditions));

    if (options.sort === "new") {
      query = (query as any).orderBy(desc(communityComments.createdAt), desc(communityComments.id));
    } else {
      // default: oldest first
      query = (query as any).orderBy(asc(communityComments.createdAt), asc(communityComments.id));
    }

    const items = (await query.limit(limit + 1)) as CommunityComment[];

    // Enrich with author data
    const authorIds = [...new Set(items.map(item => item.authorId))];
    const authors = authorIds.length > 0
      ? await this.db
          .select({ id: profiles.id, name: profiles.name, avatar: profiles.avatar })
          .from(profiles)
          .where(inArray(profiles.id, authorIds))
      : [];
    const authorMap = new Map(authors.map(a => [a.id, a]));
    const enrichedItems = items.map(item => ({
      ...item,
      authorName: authorMap.get(item.authorId)?.name ?? null,
      authorAvatar: authorMap.get(item.authorId)?.avatar ?? null,
    }));

    return buildCursorResult(enrichedItems, limit, (item) => ({
      value: item.createdAt.toISOString(),
      id: item.id,
    }));
  }

  /**
   * ID로 댓글 조회
   */
  async findById(id: string): Promise<CommunityComment | null> {
    const [result] = await this.db
      .select()
      .from(communityComments)
      .where(eq(communityComments.id, id))
      .limit(1);

    return (result as CommunityComment) ?? null;
  }

  /**
   * 댓글 업데이트
   */
  async update(id: string, content: string, userId: string): Promise<CommunityComment> {
    const comment = await this.findById(id);
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("작성자만 댓글을 수정할 수 있습니다.");
    }

    const [updated] = await this.db
      .update(communityComments)
      .set({
        content,
        isEdited: true,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(communityComments.id, id))
      .returning();

    return updated as CommunityComment;
  }

  /**
   * 댓글 삭제 (soft delete)
   */
  async delete(id: string, userId: string): Promise<void> {
    const comment = await this.findById(id);
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    // 게시물 확인
    const [post] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, comment.postId))
      .limit(1);

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 작성자 또는 모더레이터만 삭제 가능
    const isModerator = await this.communityService.isModerator(post.communityId, userId);
    if (comment.authorId !== userId && !isModerator) {
      throw new ForbiddenException("작성자 또는 관리자만 댓글을 삭제할 수 있습니다.");
    }

    // Soft delete
    await this.db
      .update(communityComments)
      .set({
        isDeleted: true,
        content: "[삭제됨]",
        updatedAt: new Date(),
      })
      .where(eq(communityComments.id, id));

    // 게시물 댓글 수 감소
    await this.db
      .update(communityPosts)
      .set({
        commentCount: sql`${communityPosts.commentCount} - 1`,
      })
      .where(eq(communityPosts.id, comment.postId));
  }

  /**
   * 댓글 제거 (Moderator)
   */
  async remove(id: string, reason: string, userId: string): Promise<CommunityComment> {
    const comment = await this.findById(id);
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    const [post] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, comment.postId))
      .limit(1);

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, post.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityComments)
      .set({
        isRemoved: true,
        removalReason: reason,
        removedBy: userId,
        content: "[removed]",
        updatedAt: new Date(),
      })
      .where(eq(communityComments.id, id))
      .returning();

    return updated as CommunityComment;
  }

  /**
   * 댓글 고정 (Moderator)
   */
  async sticky(id: string, userId: string): Promise<CommunityComment> {
    const comment = await this.findById(id);
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    const [post] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, comment.postId))
      .limit(1);

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, post.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityComments)
      .set({
        isStickied: true,
        updatedAt: new Date(),
      })
      .where(eq(communityComments.id, id))
      .returning();

    return updated as CommunityComment;
  }

  /**
   * 모더레이터 표시 (Distinguish)
   */
  async distinguish(id: string, userId: string): Promise<CommunityComment> {
    const comment = await this.findById(id);
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("작성자만 댓글을 구분 표시할 수 있습니다.");
    }

    const [post] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, comment.postId))
      .limit(1);

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, post.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityComments)
      .set({
        distinguished: "moderator",
        updatedAt: new Date(),
      })
      .where(eq(communityComments.id, id))
      .returning();

    return updated as CommunityComment;
  }
}


