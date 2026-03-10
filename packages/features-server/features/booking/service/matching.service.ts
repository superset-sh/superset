import { Injectable, Inject } from "@nestjs/common";
import { eq, and, ilike, inArray, count, desc, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  bookingProviders,
  bookingProviderCategories,
  bookingProviderProducts,
  bookingSessionProducts,
  bookingCategories,
  bookingWeeklySchedules,
  profiles,
} from "@superbuilder/drizzle";
import type { z } from "zod";
import type { searchProvidersSchema } from "../dto/search-providers.dto";
import type {
  ProviderWithDetails,
  MatchResult,
  PaginatedResult,
} from "../types";

type SearchProvidersInput = z.infer<typeof searchProvidersSchema>;

// 매칭 점수 가중치 (100점 만점)
const SCORE_WEIGHTS = {
  category: 30,
  availability: 25,
  price: 20,
  language: 15,
  mode: 10,
} as const;

@Injectable()
export class MatchingService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  // ===========================================================================
  // 상담사 탐색
  // ===========================================================================

  /**
   * 상담사 검색 (필터 + 페이지네이션)
   *
   * 필터: categoryId, budgetMax, language, mode, keyword(이름/bio), date
   * 활성 상담사만 (status='active')
   */
  async searchProviders(
    dto: SearchProvidersInput,
  ): Promise<PaginatedResult<ProviderWithDetails>> {
    const { page, limit, categoryId, budgetMax, language, mode, keyword } = dto;
    const offset = (page - 1) * limit;

    // 기본 조건: 활성 상담사만
    const conditions: ReturnType<typeof eq>[] = [
      eq(bookingProviders.status, "active"),
    ];

    // 키워드 검색 (이름 또는 bio)
    if (keyword) {
      conditions.push(
        or(
          ilike(profiles.name, `%${keyword}%`),
          ilike(bookingProviders.bio, `%${keyword}%`),
        )!,
      );
    }

    // 언어 필터 (PostgreSQL 배열 포함 연산자 사용)
    if (language) {
      conditions.push(
        sql`${bookingProviders.languages} @> ARRAY[${language}]::text[]` as ReturnType<
          typeof eq
        >,
      );
    }

    // 상담 방식 필터
    if (mode) {
      // hybrid는 online/offline 모두 가능
      conditions.push(
        or(
          eq(bookingProviders.consultationMode, mode),
          eq(bookingProviders.consultationMode, "hybrid"),
        )!,
      );
    }

    // 카테고리/예산 필터: 해당하는 상담사 ID 집합을 구성 후 inArray 조건 추가
    let filteredProviderIds: Set<string> | null = null;

    // 카테고리 필터
    if (categoryId) {
      const categoryProviders = await this.db
        .select({ providerId: bookingProviderCategories.providerId })
        .from(bookingProviderCategories)
        .where(eq(bookingProviderCategories.categoryId, categoryId));

      filteredProviderIds = new Set(
        categoryProviders.map((r) => r.providerId),
      );

      if (filteredProviderIds.size === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    // 예산 필터: 최저가 상품이 예산 이내인 상담사
    if (budgetMax !== undefined) {
      const providerPrices = await this.db
        .select({
          providerId: bookingProviderProducts.providerId,
          price: bookingSessionProducts.price,
        })
        .from(bookingProviderProducts)
        .innerJoin(
          bookingSessionProducts,
          eq(bookingProviderProducts.productId, bookingSessionProducts.id),
        )
        .where(
          and(
            eq(bookingProviderProducts.isActive, true),
            eq(bookingSessionProducts.status, "active"),
          ),
        );

      // 상담사별 최저가 맵 구성
      const minPriceMap = new Map<string, number>();
      for (const row of providerPrices) {
        const current = minPriceMap.get(row.providerId);
        if (current === undefined || row.price < current) {
          minPriceMap.set(row.providerId, row.price);
        }
      }

      const budgetProviderIds = new Set(
        Array.from(minPriceMap.entries())
          .filter(([, price]) => price <= budgetMax)
          .map(([id]) => id),
      );

      // 카테고리 필터와 교집합
      if (filteredProviderIds) {
        filteredProviderIds = new Set(
          [...filteredProviderIds].filter((id) => budgetProviderIds.has(id)),
        );
      } else {
        filteredProviderIds = budgetProviderIds;
      }

      if (filteredProviderIds.size === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    // 필터된 ID 목록을 조건에 추가
    if (filteredProviderIds) {
      conditions.push(
        inArray(bookingProviders.id, [...filteredProviderIds]),
      );
    }

    const whereClause = and(...conditions);

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

  // ===========================================================================
  // 매칭 결과
  // ===========================================================================

  /**
   * 매칭 점수 기반 상담사 추천
   *
   * 1. searchProviders로 후보 조회 (전체 결과)
   * 2. 각 후보에 매칭 점수 계산
   * 3. 점수 내림차순 정렬
   * 4. 상위 N개 반환
   */
  async getMatchResults(dto: SearchProvidersInput): Promise<MatchResult[]> {
    // 전체 후보를 가져오기 위해 큰 limit 사용
    const candidates = await this.searchProviders({
      ...dto,
      page: 1,
      limit: 100,
    });

    if (candidates.data.length === 0) {
      return [];
    }

    // 각 후보에 매칭 점수 계산
    const results: MatchResult[] = [];
    for (const provider of candidates.data) {
      const { score, reasons } = await this.calculateScore(provider, dto);
      results.push({ provider, score, reasons });
    }

    // 점수 내림차순 정렬
    results.sort((a, b) => b.score - a.score);

    // 요청 limit 만큼 반환
    return results.slice(0, dto.limit);
  }

  // ===========================================================================
  // 매칭 점수 계산
  // ===========================================================================

  /**
   * 매칭 점수 알고리즘 (100점 만점)
   *
   * 카테고리 매칭 (30점): 요청 카테고리와 상담사 카테고리 일치
   * 가용시간 매칭 (25점): 요청 날짜에 가용 슬롯 존재
   * 가격 매칭 (20점): 상담사 최저가 상품이 예산 이내
   * 언어 매칭 (15점): 요청 언어가 상담사 languages에 포함
   * 방식 매칭 (10점): 요청 mode가 상담사 mode와 일치
   */
  private async calculateScore(
    provider: ProviderWithDetails,
    criteria: SearchProvidersInput,
  ): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    // 카테고리 매칭 (30점)
    if (criteria.categoryId) {
      const hasCategory = provider.categories.some(
        (c) => c.id === criteria.categoryId,
      );
      if (hasCategory) {
        score += SCORE_WEIGHTS.category;
        reasons.push("카테고리 일치");
      }
    } else {
      // 카테고리 조건 없으면 자동 부여
      score += SCORE_WEIGHTS.category;
    }

    // 가용시간 매칭 (25점)
    if (criteria.date) {
      const hasAvailability = await this.checkAvailability(
        provider.id,
        criteria.date,
      );
      if (hasAvailability) {
        score += SCORE_WEIGHTS.availability;
        reasons.push("가용 시간 있음");
      }
    } else {
      // 날짜 조건 없으면 자동 부여
      score += SCORE_WEIGHTS.availability;
    }

    // 가격 매칭 (20점)
    if (criteria.budgetMax !== undefined) {
      const minPrice = provider.products.length > 0
        ? Math.min(...provider.products.map((p) => p.price))
        : Number.MAX_SAFE_INTEGER;

      if (minPrice <= criteria.budgetMax) {
        score += SCORE_WEIGHTS.price;
        reasons.push("예산 범위 내");
      }
    } else {
      // 예산 조건 없으면 자동 부여
      score += SCORE_WEIGHTS.price;
    }

    // 언어 매칭 (15점)
    if (criteria.language) {
      const hasLanguage = provider.languages.includes(criteria.language);
      if (hasLanguage) {
        score += SCORE_WEIGHTS.language;
        reasons.push("언어 일치");
      }
    } else {
      // 언어 조건 없으면 자동 부여
      score += SCORE_WEIGHTS.language;
    }

    // 방식 매칭 (10점)
    if (criteria.mode) {
      const modeMatch =
        provider.consultationMode === criteria.mode ||
        provider.consultationMode === "hybrid";
      if (modeMatch) {
        score += SCORE_WEIGHTS.mode;
        reasons.push("상담 방식 일치");
      }
    } else {
      // 모드 조건 없으면 자동 부여
      score += SCORE_WEIGHTS.mode;
    }

    return { score, reasons };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * 특정 날짜에 가용 슬롯이 존재하는지 간단 확인
   *
   * 주간 스케줄에 해당 요일 스케줄이 있으면 가용으로 판단
   * (상세 슬롯 계산은 AvailabilityService 담당)
   */
  private async checkAvailability(
    providerId: string,
    date: string,
  ): Promise<boolean> {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    const [schedule] = await this.db
      .select({ id: bookingWeeklySchedules.id })
      .from(bookingWeeklySchedules)
      .where(
        and(
          eq(bookingWeeklySchedules.providerId, providerId),
          eq(bookingWeeklySchedules.dayOfWeek, dayOfWeek),
          eq(bookingWeeklySchedules.isActive, true),
        ),
      )
      .limit(1);

    return !!schedule;
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
