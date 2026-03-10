import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { eq, asc, and, ilike, count, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import { bookingCategories, type BookingCategory } from "@superbuilder/drizzle";
import type { z } from "zod";
import type { createCategorySchema } from "../dto/create-category.dto";
import type { updateCategorySchema } from "../dto/update-category.dto";
import type { PaginatedResult } from "../types";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

@Injectable()
export class CategoryService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  /**
   * 활성 카테고리 목록 조회 (정렬순)
   */
  async findAll(): Promise<BookingCategory[]> {
    const items = await this.db
      .select()
      .from(bookingCategories)
      .where(eq(bookingCategories.isActive, true))
      .orderBy(asc(bookingCategories.sortOrder), asc(bookingCategories.name));

    return items as BookingCategory[];
  }

  /**
   * ID로 카테고리 조회
   */
  async findById(id: string): Promise<BookingCategory> {
    const [category] = await this.db
      .select()
      .from(bookingCategories)
      .where(eq(bookingCategories.id, id))
      .limit(1);

    if (!category) {
      throw new NotFoundException(`카테고리를 찾을 수 없습니다: ${id}`);
    }

    return category as BookingCategory;
  }

  /**
   * Slug로 카테고리 조회
   */
  async findBySlug(slug: string): Promise<BookingCategory | null> {
    const [category] = await this.db
      .select()
      .from(bookingCategories)
      .where(eq(bookingCategories.slug, slug))
      .limit(1);

    return (category as BookingCategory) ?? null;
  }

  /**
   * 카테고리 생성
   */
  async create(dto: CreateCategoryInput): Promise<BookingCategory> {
    // Slug 중복 확인
    const existing = await this.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException(`이미 사용 중인 slug입니다: ${dto.slug}`);
    }

    const [category] = await this.db
      .insert(bookingCategories)
      .values({
        name: dto.name,
        description: dto.description,
        slug: dto.slug,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    return category as BookingCategory;
  }

  /**
   * 카테고리 수정
   */
  async update(id: string, dto: UpdateCategoryInput): Promise<BookingCategory> {
    // 존재 여부 확인
    await this.findById(id);

    // Slug 변경 시 중복 체크
    if (dto.slug) {
      const existing = await this.findBySlug(dto.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException(`이미 사용 중인 slug입니다: ${dto.slug}`);
      }
    }

    const [updated] = await this.db
      .update(bookingCategories)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(bookingCategories.id, id))
      .returning();

    return updated as BookingCategory;
  }

  /**
   * 카테고리 삭제
   */
  async delete(id: string): Promise<{ success: boolean }> {
    await this.findById(id);

    await this.db
      .delete(bookingCategories)
      .where(eq(bookingCategories.id, id));

    return { success: true };
  }

  /**
   * 카테고리 정렬 순서 변경
   */
  async reorder(
    items: { id: string; sortOrder: number }[],
  ): Promise<{ success: boolean }> {
    for (const item of items) {
      await this.db
        .update(bookingCategories)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(bookingCategories.id, item.id));
    }

    return { success: true };
  }

  /**
   * 카테고리 활성/비활성 토글
   */
  async toggleActive(id: string): Promise<BookingCategory> {
    const category = await this.findById(id);

    const [updated] = await this.db
      .update(bookingCategories)
      .set({
        isActive: !category.isActive,
        updatedAt: new Date(),
      })
      .where(eq(bookingCategories.id, id))
      .returning();

    return updated as BookingCategory;
  }

  /**
   * 카테고리 통계 (전체/활성 수)
   */
  async getCounts(): Promise<{ total: number; active: number }> {
    const [result] = await this.db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${bookingCategories.isActive} = true)`.as(
            "active",
          ),
      })
      .from(bookingCategories);

    return {
      total: result?.total ?? 0,
      active: result?.active ?? 0,
    };
  }

  /**
   * [Admin] 전체 카테고리 목록 (비활성 포함, 페이지네이션)
   */
  async adminFindAll(input: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<PaginatedResult<BookingCategory>> {
    const { page, limit, search } = input;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(bookingCategories.name, `%${search}%`),
          ilike(bookingCategories.slug, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(bookingCategories)
        .where(whereClause)
        .orderBy(asc(bookingCategories.sortOrder), asc(bookingCategories.name))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingCategories)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: data as BookingCategory[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
