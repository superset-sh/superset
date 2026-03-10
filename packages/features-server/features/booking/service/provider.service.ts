import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { eq, and, desc, count, ilike, inArray, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  bookingProviders,
  bookingProviderCategories,
  bookingCategories,
  bookingProviderProducts,
  bookingSessionProducts,
  profiles,
  type BookingProvider,
} from "@superbuilder/drizzle";
import type { z } from "zod";
import type { createProviderSchema } from "../dto/create-provider.dto";
import type { updateProviderProfileSchema } from "../dto/update-provider-profile.dto";
import type { updateProviderStatusSchema } from "../dto/update-provider-status.dto";
import type { ProviderWithDetails, PaginatedResult } from "../types";

type CreateProviderInput = z.infer<typeof createProviderSchema>;
type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>;
type UpdateProviderStatusInput = z.infer<typeof updateProviderStatusSchema>;

@Injectable()
export class ProviderService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  /**
   * 상담사 등록
   */
  async register(
    userId: string,
    dto: CreateProviderInput,
  ): Promise<ProviderWithDetails> {
    // 이미 등록된 상담사인지 확인
    const existing = await this.findByProfileId(userId);
    if (existing) {
      throw new ConflictException("이미 상담사로 등록되어 있습니다");
    }

    // 카테고리 존재 여부 확인
    await this.validateCategoryIds(dto.categoryIds);

    // 상담사 프로필 생성
    const [provider] = await this.db
      .insert(bookingProviders)
      .values({
        profileId: userId,
        bio: dto.bio,
        experienceYears: dto.experienceYears,
        consultationMode: dto.consultationMode ?? "online",
        languages: dto.languages ?? ["ko"],
        status: "inactive", // 초기 상태는 비활성
      })
      .returning();

    if (!provider) {
      throw new BadRequestException("상담사 등록에 실패했습니다");
    }

    // 카테고리 매핑 추가
    await this.syncCategories(provider.id, dto.categoryIds);

    return this.getProviderWithDetails(provider.id);
  }

  /**
   * 상담사 프로필 수정 (본인)
   */
  async updateProfile(
    userId: string,
    dto: UpdateProviderProfileInput,
  ): Promise<ProviderWithDetails> {
    const provider = await this.findByProfileId(userId);
    if (!provider) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }

    // 카테고리 변경 시 존재 여부 확인
    if (dto.categoryIds) {
      await this.validateCategoryIds(dto.categoryIds);
    }

    // 프로필 정보 업데이트
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (dto.bio !== undefined) updateData.bio = dto.bio;
    if (dto.experienceYears !== undefined)
      updateData.experienceYears = dto.experienceYears;
    if (dto.consultationMode !== undefined)
      updateData.consultationMode = dto.consultationMode;
    if (dto.languages !== undefined) updateData.languages = dto.languages;

    await this.db
      .update(bookingProviders)
      .set(updateData)
      .where(eq(bookingProviders.id, provider.id));

    // 카테고리 동기화 (기존 삭제 + 새로 insert)
    if (dto.categoryIds) {
      await this.syncCategories(provider.id, dto.categoryIds);
    }

    return this.getProviderWithDetails(provider.id);
  }

  /**
   * 상담사 상태 변경
   */
  async updateStatus(
    providerId: string,
    dto: UpdateProviderStatusInput,
    options?: { isAdmin?: boolean },
  ): Promise<BookingProvider> {
    const provider = await this.findById(providerId);

    // 상태 전이 검증
    this.validateStatusTransition(
      provider.status,
      dto.status,
      options?.isAdmin ?? false,
    );

    const [updated] = await this.db
      .update(bookingProviders)
      .set({
        status: dto.status,
        updatedAt: new Date(),
      })
      .where(eq(bookingProviders.id, providerId))
      .returning();

    return updated as BookingProvider;
  }

  /**
   * 내 상담사 프로필 조회
   * 미등록 상태면 null 반환 (에러가 아님)
   */
  async getMyProfile(userId: string): Promise<ProviderWithDetails | null> {
    const provider = await this.findByProfileId(userId);
    if (!provider) {
      return null;
    }

    return this.getProviderWithDetails(provider.id);
  }

  /**
   * ID로 상담사 조회 (기본 정보)
   */
  async findById(id: string): Promise<BookingProvider> {
    const [provider] = await this.db
      .select()
      .from(bookingProviders)
      .where(eq(bookingProviders.id, id))
      .limit(1);

    if (!provider) {
      throw new NotFoundException(`상담사를 찾을 수 없습니다: ${id}`);
    }

    return provider as BookingProvider;
  }

  /**
   * ID로 상담사 상세 조회 (프로필 + 카테고리 + 상품 포함)
   */
  async getProviderWithDetails(id: string): Promise<ProviderWithDetails> {
    // provider + profile join
    const [providerRow] = await this.db
      .select({
        id: bookingProviders.id,
        profileId: bookingProviders.profileId,
        name: profiles.name,
        email: profiles.email,
        avatar: profiles.avatar,
        bio: bookingProviders.bio,
        experienceYears: bookingProviders.experienceYears,
        consultationMode: bookingProviders.consultationMode,
        languages: bookingProviders.languages,
        status: bookingProviders.status,
        createdAt: bookingProviders.createdAt,
      })
      .from(bookingProviders)
      .innerJoin(profiles, eq(bookingProviders.profileId, profiles.id))
      .where(eq(bookingProviders.id, id))
      .limit(1);

    if (!providerRow) {
      throw new NotFoundException(`상담사를 찾을 수 없습니다: ${id}`);
    }

    // 카테고리 조회
    const categories = await this.db
      .select({
        id: bookingCategories.id,
        name: bookingCategories.name,
        slug: bookingCategories.slug,
        icon: bookingCategories.icon,
      })
      .from(bookingProviderCategories)
      .innerJoin(
        bookingCategories,
        eq(bookingProviderCategories.categoryId, bookingCategories.id),
      )
      .where(eq(bookingProviderCategories.providerId, id));

    // 상품 조회
    const products = await this.db
      .select({
        id: bookingSessionProducts.id,
        name: bookingSessionProducts.name,
        durationMinutes: bookingSessionProducts.durationMinutes,
        price: bookingSessionProducts.price,
      })
      .from(bookingProviderProducts)
      .innerJoin(
        bookingSessionProducts,
        eq(bookingProviderProducts.productId, bookingSessionProducts.id),
      )
      .where(
        and(
          eq(bookingProviderProducts.providerId, id),
          eq(bookingProviderProducts.isActive, true),
        ),
      );

    return {
      ...providerRow,
      categories,
      products,
    };
  }

  /**
   * [Admin] 전체 상담사 목록 (페이지네이션)
   */
  async listProviders(input: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
  }): Promise<PaginatedResult<ProviderWithDetails>> {
    const { page, limit, status, search } = input;
    const offset = (page - 1) * limit;

    // 필터 조건 구성
    const conditions: ReturnType<typeof eq>[] = [];
    if (status) {
      conditions.push(
        eq(
          bookingProviders.status,
          status as
            | "pending_review"
            | "active"
            | "inactive"
            | "suspended",
        ),
      );
    }
    if (search) {
      conditions.push(
        or(
          ilike(profiles.name, `%${search}%`),
          ilike(profiles.email, `%${search}%`),
          ilike(bookingProviders.bio, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // provider + profile join 기반 목록 조회
    const [rows, totalResult] = await Promise.all([
      this.db
        .select({
          id: bookingProviders.id,
          profileId: bookingProviders.profileId,
          name: profiles.name,
          email: profiles.email,
          avatar: profiles.avatar,
          bio: bookingProviders.bio,
          experienceYears: bookingProviders.experienceYears,
          consultationMode: bookingProviders.consultationMode,
          languages: bookingProviders.languages,
          status: bookingProviders.status,
          createdAt: bookingProviders.createdAt,
        })
        .from(bookingProviders)
        .innerJoin(profiles, eq(bookingProviders.profileId, profiles.id))
        .where(whereClause)
        .orderBy(desc(bookingProviders.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingProviders)
        .innerJoin(profiles, eq(bookingProviders.profileId, profiles.id))
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    // 각 상담사별 카테고리/상품 조회
    const providerIds = rows.map((r) => r.id);
    const [allCategories, allProducts] = await Promise.all([
      this.getCategoriesForProviders(providerIds),
      this.getProductsForProviders(providerIds),
    ]);

    const data: ProviderWithDetails[] = rows.map((row) => ({
      ...row,
      categories: allCategories.get(row.id) ?? [],
      products: allProducts.get(row.id) ?? [],
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 상담사 통계
   */
  async getCounts(): Promise<{
    total: number;
    active: number;
    pending: number;
  }> {
    const [result] = await this.db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${bookingProviders.status} = 'active')`.as(
            "active",
          ),
        pending:
          sql<number>`count(*) filter (where ${bookingProviders.status} = 'pending_review')`.as(
            "pending",
          ),
      })
      .from(bookingProviders);

    return {
      total: result?.total ?? 0,
      active: result?.active ?? 0,
      pending: result?.pending ?? 0,
    };
  }

  /**
   * 활성 상담사 목록 (고객 탐색용)
   */
  async getActiveProviders(): Promise<ProviderWithDetails[]> {
    const rows = await this.db
      .select({
        id: bookingProviders.id,
        profileId: bookingProviders.profileId,
        name: profiles.name,
        email: profiles.email,
        avatar: profiles.avatar,
        bio: bookingProviders.bio,
        experienceYears: bookingProviders.experienceYears,
        consultationMode: bookingProviders.consultationMode,
        languages: bookingProviders.languages,
        status: bookingProviders.status,
        createdAt: bookingProviders.createdAt,
      })
      .from(bookingProviders)
      .innerJoin(profiles, eq(bookingProviders.profileId, profiles.id))
      .where(eq(bookingProviders.status, "active"))
      .orderBy(desc(bookingProviders.createdAt));

    const providerIds = rows.map((r) => r.id);
    const [allCategories, allProducts] = await Promise.all([
      this.getCategoriesForProviders(providerIds),
      this.getProductsForProviders(providerIds),
    ]);

    return rows.map((row) => ({
      ...row,
      categories: allCategories.get(row.id) ?? [],
      products: allProducts.get(row.id) ?? [],
    }));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * profileId로 상담사 조회
   */
  private async findByProfileId(
    profileId: string,
  ): Promise<BookingProvider | null> {
    const [provider] = await this.db
      .select()
      .from(bookingProviders)
      .where(eq(bookingProviders.profileId, profileId))
      .limit(1);

    return (provider as BookingProvider) ?? null;
  }

  /**
   * 카테고리 ID 목록 유효성 확인
   */
  private async validateCategoryIds(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) return;

    const existing = await this.db
      .select({ id: bookingCategories.id })
      .from(bookingCategories)
      .where(inArray(bookingCategories.id, categoryIds));

    if (existing.length !== categoryIds.length) {
      const foundIds = new Set(existing.map((c) => c.id));
      const missing = categoryIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `존재하지 않는 카테고리가 포함되어 있습니다: ${missing.join(", ")}`,
      );
    }
  }

  /**
   * 상담사-카테고리 매핑 동기화 (기존 삭제 + 새로 insert)
   */
  private async syncCategories(
    providerId: string,
    categoryIds: string[],
  ): Promise<void> {
    // 기존 매핑 삭제
    await this.db
      .delete(bookingProviderCategories)
      .where(eq(bookingProviderCategories.providerId, providerId));

    // 새 매핑 추가
    if (categoryIds.length > 0) {
      await this.db.insert(bookingProviderCategories).values(
        categoryIds.map((categoryId) => ({
          providerId,
          categoryId,
        })),
      );
    }
  }

  /**
   * 상태 전이 검증
   *
   * - inactive → active: 누구나 가능 (본인 또는 Admin)
   * - active → inactive: 누구나 가능
   * - suspended → active: Admin만 가능
   * - * → suspended: Admin만 가능
   */
  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
    isAdmin: boolean,
  ): void {
    if (currentStatus === newStatus) return;

    // suspended 관련 전이는 Admin만 허용
    if (currentStatus === "suspended" && !isAdmin) {
      throw new ForbiddenException(
        "정지된 상담사의 상태 변경은 관리자만 가능합니다",
      );
    }

    if (newStatus === "suspended" && !isAdmin) {
      throw new ForbiddenException("상담사 정지는 관리자만 가능합니다");
    }
  }

  /**
   * 여러 상담사의 카테고리를 한번에 조회
   */
  private async getCategoriesForProviders(
    providerIds: string[],
  ): Promise<
    Map<
      string,
      { id: string; name: string; slug: string; icon: string | null }[]
    >
  > {
    if (providerIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        providerId: bookingProviderCategories.providerId,
        id: bookingCategories.id,
        name: bookingCategories.name,
        slug: bookingCategories.slug,
        icon: bookingCategories.icon,
      })
      .from(bookingProviderCategories)
      .innerJoin(
        bookingCategories,
        eq(bookingProviderCategories.categoryId, bookingCategories.id),
      )
      .where(inArray(bookingProviderCategories.providerId, providerIds));

    const map = new Map<
      string,
      { id: string; name: string; slug: string; icon: string | null }[]
    >();

    for (const row of rows) {
      const list = map.get(row.providerId) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
      });
      map.set(row.providerId, list);
    }

    return map;
  }

  /**
   * 여러 상담사의 상품을 한번에 조회
   */
  private async getProductsForProviders(
    providerIds: string[],
  ): Promise<
    Map<
      string,
      { id: string; name: string; durationMinutes: number; price: number }[]
    >
  > {
    if (providerIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        providerId: bookingProviderProducts.providerId,
        id: bookingSessionProducts.id,
        name: bookingSessionProducts.name,
        durationMinutes: bookingSessionProducts.durationMinutes,
        price: bookingSessionProducts.price,
      })
      .from(bookingProviderProducts)
      .innerJoin(
        bookingSessionProducts,
        eq(bookingProviderProducts.productId, bookingSessionProducts.id),
      )
      .where(
        and(
          inArray(bookingProviderProducts.providerId, providerIds),
          eq(bookingProviderProducts.isActive, true),
        ),
      );

    const map = new Map<
      string,
      { id: string; name: string; durationMinutes: number; price: number }[]
    >();

    for (const row of rows) {
      const list = map.get(row.providerId) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        durationMinutes: row.durationMinutes,
        price: row.price,
      });
      map.set(row.providerId, list);
    }

    return map;
  }
}
