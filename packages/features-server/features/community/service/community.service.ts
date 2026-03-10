import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { eq, desc, and, count, or, ilike, sql, asc } from "drizzle-orm";
import { decodeCursor, buildCursorResult } from "../../../shared/utils/pagination";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  communities,
  communityMemberships,
  communityModerators,
  communityPosts,
  communityComments,
  type Community,
  type CommunityMembership,
} from "@superbuilder/drizzle";
import type { CreateCommunityDto, UpdateCommunityDto } from "../dto";

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface CommunityListOptions {
  search?: string;
  type?: "public" | "restricted" | "private";
  sort?: "newest" | "popular" | "name";
  cursor?: string;
  limit?: number;
}

@Injectable()
export class CommunityService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>) {}

  /**
   * 커뮤니티 생성
   */
  async create(dto: CreateCommunityDto, userId: string): Promise<Community> {
    // Slug 중복 확인
    const existing = await this.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException(`이미 사용 중인 슬러그입니다: ${dto.slug}`);
    }

    // 커뮤니티 생성
    const [community] = await this.db
      .insert(communities)
      .values({
        ...dto,
        ownerId: userId,
        rules: dto.rules ?? [],
      })
      .returning();

    if (!community) {
      throw new InternalServerErrorException("커뮤니티 생성에 실패했습니다");
    }

    // Owner를 멤버로 자동 추가
    await this.db.insert(communityMemberships).values({
      communityId: community.id,
      userId,
      role: "owner",
    });

    // Owner 추가에 따른 멤버 수 증가
    await this.db
      .update(communities)
      .set({
        memberCount: sql`${communities.memberCount} + 1`,
      })
      .where(eq(communities.id, community.id));

    return { ...community, memberCount: 1 } as Community;
  }

  /**
   * 커뮤니티 목록 조회 (cursor pagination)
   */
  async findAll(options: CommunityListOptions = {}) {
    const limit = options.limit ?? 20;

    // 필터 조건
    const conditions: any[] = [];
    if (options.type) {
      conditions.push(eq(communities.type, options.type));
    }
    if (options.search) {
      conditions.push(
        or(
          ilike(communities.name, `%${options.search}%`),
          ilike(communities.description, `%${options.search}%`)
        )
      );
    }

    // 커서 디코딩 및 커서 조건 추가
    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (decoded) {
        switch (options.sort) {
          case "popular":
            conditions.push(
              sql`(${communities.memberCount}, ${communities.id}) < (${decoded.value}, ${decoded.id})`
            );
            break;
          case "name":
            conditions.push(
              sql`(${communities.name}, ${communities.id}) > (${decoded.value}, ${decoded.id})`
            );
            break;
          case "newest":
          default:
            conditions.push(
              sql`(${communities.createdAt}, ${communities.id}) < (${decoded.value}, ${decoded.id})`
            );
        }
      }
    }

    let query = this.db.select().from(communities);
    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    // 정렬
    switch (options.sort) {
      case "popular":
        query = (query as any).orderBy(desc(communities.memberCount), desc(communities.id));
        break;
      case "name":
        query = (query as any).orderBy(asc(communities.name), asc(communities.id));
        break;
      case "newest":
      default:
        query = (query as any).orderBy(desc(communities.createdAt), desc(communities.id));
    }

    // limit + 1로 조회하여 nextCursor 판단
    const items = (await query.limit(limit + 1)) as Community[];
    return buildCursorResult(items, limit, (item) => {
      switch (options.sort) {
        case "popular":
          return { value: String(item.memberCount), id: item.id };
        case "name":
          return { value: item.name, id: item.id };
        case "newest":
        default:
          return { value: item.createdAt.toISOString(), id: item.id };
      }
    });
  }

  /**
   * Slug로 커뮤니티 조회
   */
  async findBySlug(slug: string): Promise<Community | null> {
    const [result] = await this.db
      .select()
      .from(communities)
      .where(eq(communities.slug, slug))
      .limit(1);

    return (result as Community) ?? null;
  }

  /**
   * ID로 커뮤니티 조회
   */
  async findById(id: string): Promise<Community | null> {
    const [result] = await this.db
      .select()
      .from(communities)
      .where(eq(communities.id, id))
      .limit(1);

    return (result as Community) ?? null;
  }

  /**
   * 인기 커뮤니티 조회
   */
  async findPopular(limit: number = 10): Promise<Community[]> {
    const items = await this.db
      .select()
      .from(communities)
      .where(eq(communities.type, "public"))
      .orderBy(desc(communities.memberCount))
      .limit(limit);

    return items as Community[];
  }

  /**
   * 사용자 구독 커뮤니티 조회
   */
  async findUserSubscriptions(userId: string): Promise<Community[]> {
    const items = await this.db
      .select({
        id: communities.id,
        name: communities.name,
        slug: communities.slug,
        description: communities.description,
        iconUrl: communities.iconUrl,
        bannerUrl: communities.bannerUrl,
        ownerId: communities.ownerId,
        type: communities.type,
        isOfficial: communities.isOfficial,
        isNsfw: communities.isNsfw,
        allowImages: communities.allowImages,
        allowVideos: communities.allowVideos,
        allowPolls: communities.allowPolls,
        allowCrosspost: communities.allowCrosspost,
        memberCount: communities.memberCount,
        postCount: communities.postCount,
        onlineCount: communities.onlineCount,
        rules: communities.rules,
        automodConfig: communities.automodConfig,
        bannedWords: communities.bannedWords,
        createdAt: communities.createdAt,
        updatedAt: communities.updatedAt,
      })
      .from(communities)
      .innerJoin(communityMemberships, eq(communities.id, communityMemberships.communityId))
      .where(eq(communityMemberships.userId, userId))
      .orderBy(desc(communityMemberships.joinedAt));

    return items as Community[];
  }

  /**
   * 커뮤니티 업데이트
   */
  async update(slug: string, dto: UpdateCommunityDto, userId: string): Promise<Community> {
    const community = await this.findBySlug(slug);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // 권한 확인 (Owner 또는 Admin)
    const membership = await this.getMembership(community.id, userId);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new ForbiddenException("커뮤니티 소유자 또는 관리자만 설정을 변경할 수 있습니다.");
    }

    const [updated] = await this.db
      .update(communities)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(communities.id, community.id))
      .returning();

    return updated as Community;
  }

  /**
   * 커뮤니티 삭제
   */
  async delete(slug: string, userId: string): Promise<void> {
    const community = await this.findBySlug(slug);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // Owner만 삭제 가능
    if (community.ownerId !== userId) {
      throw new ForbiddenException("커뮤니티 소유자만 삭제할 수 있습니다.");
    }

    await this.db.delete(communities).where(eq(communities.id, community.id));
  }

  /**
   * 커뮤니티 가입
   */
  async join(slug: string, userId: string): Promise<CommunityMembership> {
    const community = await this.findBySlug(slug);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // Private 커뮤니티는 초대만 가능
    if (community.type === "private") {
      throw new ForbiddenException("비공개 커뮤니티는 초대를 통해서만 가입할 수 있습니다.");
    }

    // 이미 가입되어 있는지 확인
    const existing = await this.getMembership(community.id, userId);
    if (existing) {
      throw new ConflictException("이미 이 커뮤니티에 가입되어 있습니다.");
    }

    // 밴 여부 확인
    // (추후 ban service에서 확인)

    // 가입
    const [membership] = await this.db
      .insert(communityMemberships)
      .values({
        communityId: community.id,
        userId,
        role: "member",
      })
      .returning();

    // 멤버 수 증가
    await this.db
      .update(communities)
      .set({
        memberCount: sql`${communities.memberCount} + 1`,
      })
      .where(eq(communities.id, community.id));

    return membership as CommunityMembership;
  }

  /**
   * 커뮤니티 탈퇴
   */
  async leave(slug: string, userId: string): Promise<void> {
    const community = await this.findBySlug(slug);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    // Owner는 탈퇴 불가
    if (community.ownerId === userId) {
      throw new ForbiddenException("커뮤니티 소유자는 탈퇴할 수 없습니다.");
    }

    const membership = await this.getMembership(community.id, userId);
    if (!membership) {
      throw new NotFoundException("이 커뮤니티의 멤버가 아닙니다.");
    }

    // 탈퇴
    await this.db
      .delete(communityMemberships)
      .where(
        and(eq(communityMemberships.communityId, community.id), eq(communityMemberships.userId, userId))
      );

    // 멤버 수 감소
    await this.db
      .update(communities)
      .set({
        memberCount: sql`${communities.memberCount} - 1`,
      })
      .where(eq(communities.id, community.id));
  }

  /**
   * 커뮤니티 멤버 목록
   */
  async getMembers(slug: string, options: PaginationOptions = {}) {
    const community = await this.findBySlug(slug);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const offset = (page - 1) * limit;

    const [items, totalResult] = await Promise.all([
      this.db
        .select()
        .from(communityMemberships)
        .where(eq(communityMemberships.communityId, community.id))
        .orderBy(desc(communityMemberships.joinedAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(communityMemberships)
        .where(eq(communityMemberships.communityId, community.id)),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      items: items as CommunityMembership[],
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * 모더레이터 목록
   */
  async getModerators(slug: string) {
    const community = await this.findBySlug(slug);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다.");
    }

    const items = await this.db
      .select()
      .from(communityModerators)
      .where(eq(communityModerators.communityId, community.id))
      .orderBy(communityModerators.appointedAt);

    return items;
  }

  /**
   * 멤버십 조회
   */
  async getMembership(communityId: string, userId: string): Promise<CommunityMembership | null> {
    const [result] = await this.db
      .select()
      .from(communityMemberships)
      .where(
        and(eq(communityMemberships.communityId, communityId), eq(communityMemberships.userId, userId))
      )
      .limit(1);

    return (result as CommunityMembership) ?? null;
  }

  /**
   * 멤버 여부 확인
   */
  async isMember(communityId: string, userId: string): Promise<boolean> {
    const membership = await this.getMembership(communityId, userId);
    return !!membership && !membership.isBanned;
  }

  /**
   * 모더레이터 여부 확인
   */
  async isModerator(communityId: string, userId: string): Promise<boolean> {
    const membership = await this.getMembership(communityId, userId);
    return !!membership && ["moderator", "admin", "owner"].includes(membership.role);
  }

  /**
   * [Admin] 커뮤니티 목록 조회 (offset pagination)
   */
  async adminFindAll(input: { page: number; limit: number; search?: string; type?: string }) {
    const { page, limit, search, type } = input;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (type) conditions.push(eq(communities.type, type as "public" | "restricted" | "private"));
    if (search) {
      conditions.push(
        or(
          ilike(communities.name, `%${search}%`),
          ilike(communities.description, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(communities)
        .where(whereClause)
        .orderBy(desc(communities.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(communities).where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * [Admin] 커뮤니티 삭제 (hard delete)
   */
  async adminDelete(communityId: string) {
    const community = await this.findById(communityId);
    if (!community) {
      throw new NotFoundException("커뮤니티를 찾을 수 없습니다");
    }
    await this.db.delete(communities).where(eq(communities.id, communityId));
    return { success: true };
  }

  /**
   * [Admin] 전체 시스템 통계
   */
  async getSystemStats() {
    const [commResult, memberResult, postResult, commentResult] = await Promise.all([
      this.db.select({ count: count() }).from(communities),
      this.db.select({ count: count() }).from(communityMemberships),
      this.db.select({ count: count() }).from(communityPosts),
      this.db.select({ count: count() }).from(communityComments),
    ]);
    return {
      totalCommunities: commResult[0]?.count ?? 0,
      totalMembers: memberResult[0]?.count ?? 0,
      totalPosts: postResult[0]?.count ?? 0,
      totalComments: commentResult[0]?.count ?? 0,
    };
  }
}


