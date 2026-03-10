import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { decodeCursor, buildCursorResult } from "../../../shared/utils/pagination";
import {
  communityPosts,
  communities,
  profiles,
  type CommunityPost,
} from "@superbuilder/drizzle";
import type { CreatePostDto, UpdatePostDto } from "../dto";
import { CommunityService } from "./community.service";
import { assertCommunityPermission } from "../helpers/permission";

export interface PostListOptions {
  communitySlug?: string;
  communityId?: string;
  sort?: "new";
  cursor?: string;
  limit?: number;
}

@Injectable()
export class CommunityPostService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
    private readonly communityService: CommunityService
  ) {}

  /**
   * 게시물 생성
   */
  async create(dto: CreatePostDto, userId: string): Promise<CommunityPost> {
    // 커뮤니티 확인
    const community = await this.communityService.findById(dto.communityId);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // 멤버십 확인
    const isMember = await this.communityService.isMember(dto.communityId, userId);
    if (!isMember) {
      throw new ForbiddenException("커뮤니티에 가입해야 게시글을 작성할 수 있습니다.");
    }

    // 게시물 생성
    const [post] = await this.db
      .insert(communityPosts)
      .values({
        ...dto,
        authorId: userId,
        hotScore: this.calculateHotScore(0, new Date()),
      })
      .returning();

    // 커뮤니티 게시물 수 증가
    await this.db
      .update(communities)
      .set({
        postCount: sql`${communities.postCount} + 1`,
      })
      .where(eq(communities.id, dto.communityId));

    return post as CommunityPost;
  }

  /**
   * 게시물 목록 조회 (cursor pagination, newest first)
   */
  async findAll(options: PostListOptions = {}) {
    const limit = options.limit ?? 25;

    // 필터 조건
    const conditions: any[] = [eq(communityPosts.status, "published")];

    if (options.communityId) {
      conditions.push(eq(communityPosts.communityId, options.communityId));
    } else if (options.communitySlug) {
      const community = await this.communityService.findBySlug(options.communitySlug);
      if (community) {
        conditions.push(eq(communityPosts.communityId, community.id));
      }
    }

    // 커서 디코딩
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        conditions.push(
          sql`(${communityPosts.createdAt}, ${communityPosts.id}) < (${decoded.value}, ${decoded.id})`
        );
      }
    }

    let query = this.db.select().from(communityPosts);
    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    query = (query as any).orderBy(desc(communityPosts.createdAt), desc(communityPosts.id));

    const items = (await query.limit(limit + 1)) as CommunityPost[];

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
   * ID로 게시물 조회
   */
  async findById(id: string) {
    const [result] = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, id))
      .limit(1);

    if (!result) {
      return null;
    }

    const post = result as CommunityPost;

    // Author lookup
    const [author] = await this.db
      .select({ id: profiles.id, name: profiles.name, avatar: profiles.avatar })
      .from(profiles)
      .where(eq(profiles.id, post.authorId))
      .limit(1);
    const authorName = author?.name ?? null;
    const authorAvatar = author?.avatar ?? null;

    // 삭제/제거된 게시글 플레이스홀더 처리
    if (post.status === "deleted") {
      return {
        ...post,
        title: "[삭제된 게시글]",
        content: "[삭제된 게시글]",
        authorName,
        authorAvatar,
      };
    }
    if (post.status === "removed") {
      return {
        ...post,
        title: "[운영 정책에 의해 삭제됨]",
        content: "[운영 정책에 의해 삭제됨]",
        authorName,
        authorAvatar,
      };
    }

    // 조회수 증가 (published만)
    await this.db
      .update(communityPosts)
      .set({
        viewCount: sql`${communityPosts.viewCount} + 1`,
      })
      .where(eq(communityPosts.id, id));

    return { ...post, authorName, authorAvatar };
  }

  /**
   * 게시물 업데이트
   */
  async update(id: string, dto: UpdatePostDto, userId: string): Promise<CommunityPost> {
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 작성자만 수정 가능
    if (post.authorId !== userId) {
      throw new ForbiddenException("작성자만 게시글을 수정할 수 있습니다.");
    }

    const [updated] = await this.db
      .update(communityPosts)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, id))
      .returning();

    return updated as CommunityPost;
  }

  /**
   * 게시물 삭제
   */
  async delete(id: string, userId: string): Promise<void> {
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 작성자 또는 모더레이터만 삭제 가능
    const isModerator = await this.communityService.isModerator(post.communityId, userId);
    if (post.authorId !== userId && !isModerator) {
      throw new ForbiddenException("작성자 또는 관리자만 게시글을 삭제할 수 있습니다.");
    }

    await this.db
      .update(communityPosts)
      .set({
        status: "deleted",
        content: "[deleted]",
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, id));

    // 커뮤니티 게시물 수 감소
    await this.db
      .update(communities)
      .set({
        postCount: sql`${communities.postCount} - 1`,
      })
      .where(eq(communities.id, post.communityId));
  }

  /**
   * 게시물 고정 (Moderator)
   */
  async pin(id: string, userId: string): Promise<CommunityPost> {
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, post.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityPosts)
      .set({
        isPinned: true,
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, id))
      .returning();

    return updated as CommunityPost;
  }

  /**
   * 게시물 잠금 (Moderator)
   */
  async lock(id: string, userId: string): Promise<CommunityPost> {
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, post.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityPosts)
      .set({
        isLocked: true,
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, id))
      .returning();

    return updated as CommunityPost;
  }

  /**
   * 게시물 제거 (Moderator)
   */
  async remove(id: string, reason: string, userId: string): Promise<CommunityPost> {
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, post.communityId, ["owner", "admin", "moderator"]);

    const [updated] = await this.db
      .update(communityPosts)
      .set({
        status: "removed",
        removalReason: reason,
        removedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(communityPosts.id, id))
      .returning();

    return updated as CommunityPost;
  }

  /**
   * 교차 게시 (Crosspost)
   */
  async crosspost(
    postId: string,
    targetCommunityId: string,
    userId: string
  ): Promise<CommunityPost> {
    const originalPost = await this.findById(postId);
    if (!originalPost) {
      throw new NotFoundException("원본 게시글을 찾을 수 없습니다.");
    }

    const targetCommunity = await this.communityService.findById(targetCommunityId);
    if (!targetCommunity) {
      throw new NotFoundException("대상 커뮤니티를 찾을 수 없습니다.");
    }

    if (!targetCommunity.allowCrosspost) {
      throw new ForbiddenException("대상 커뮤니티에서 교차 게시를 허용하지 않습니다.");
    }

    await assertCommunityPermission(this.communityService, userId, targetCommunityId, ["owner", "admin", "moderator", "member"]);

    const [crosspost] = await this.db
      .insert(communityPosts)
      .values({
        communityId: targetCommunityId,
        authorId: userId,
        title: `[Crosspost] ${originalPost.title}`,
        content: originalPost.content,
        type: originalPost.type,
        linkUrl: originalPost.linkUrl,
        mediaUrls: originalPost.mediaUrls,
        crosspostParentId: postId,
        hotScore: this.calculateHotScore(0, new Date()),
      })
      .returning();

    return crosspost as CommunityPost;
  }

  /**
   * Hot Score 계산 (Reddit 알고리즘)
   */
  private calculateHotScore(voteScore: number, createdAt: Date): number {
    const score = voteScore;
    const order = Math.log10(Math.max(Math.abs(score), 1));
    const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
    const seconds = (createdAt.getTime() - new Date("2005-12-08").getTime()) / 1000;

    return sign * order + seconds / 45000;
  }

  /**
   * Hot Score 업데이트 (백그라운드 작업)
   */
  async updateHotScores(): Promise<void> {
    const posts = await this.db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.status, "published"))
      .limit(1000);

    for (const post of posts) {
      const hotScore = this.calculateHotScore(post.voteScore, post.createdAt);
      await this.db
        .update(communityPosts)
        .set({ hotScore })
        .where(eq(communityPosts.id, post.id));
    }
  }
}


