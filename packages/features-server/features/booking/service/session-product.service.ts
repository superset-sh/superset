import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { eq, asc, and, count, ilike, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  bookingSessionProducts,
  bookingProviderProducts,
  type BookingSessionProduct,
} from "@superbuilder/drizzle";
import type { z } from "zod";
import type { createSessionProductSchema } from "../dto/create-session-product.dto";
import type { updateSessionProductSchema } from "../dto/update-session-product.dto";
import type { PaginatedResult } from "../types";

type CreateSessionProductInput = z.infer<typeof createSessionProductSchema>;
type UpdateSessionProductInput = z.infer<typeof updateSessionProductSchema>;

@Injectable()
export class SessionProductService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  /**
   * 활성 세션 상품 목록 조회 (정렬순)
   */
  async findAll(): Promise<BookingSessionProduct[]> {
    const items = await this.db
      .select()
      .from(bookingSessionProducts)
      .where(eq(bookingSessionProducts.status, "active"))
      .orderBy(
        asc(bookingSessionProducts.sortOrder),
        asc(bookingSessionProducts.name),
      );

    return items as BookingSessionProduct[];
  }

  /**
   * ID로 세션 상품 조회
   */
  async findById(id: string): Promise<BookingSessionProduct> {
    const [product] = await this.db
      .select()
      .from(bookingSessionProducts)
      .where(eq(bookingSessionProducts.id, id))
      .limit(1);

    if (!product) {
      throw new NotFoundException(`세션 상품을 찾을 수 없습니다: ${id}`);
    }

    return product as BookingSessionProduct;
  }

  /**
   * 세션 상품 생성
   */
  async create(dto: CreateSessionProductInput): Promise<BookingSessionProduct> {
    const [product] = await this.db
      .insert(bookingSessionProducts)
      .values({
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        currency: dto.currency ?? "KRW",
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    return product as BookingSessionProduct;
  }

  /**
   * 세션 상품 수정
   */
  async update(
    id: string,
    dto: UpdateSessionProductInput,
  ): Promise<BookingSessionProduct> {
    await this.findById(id);

    const [updated] = await this.db
      .update(bookingSessionProducts)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(bookingSessionProducts.id, id))
      .returning();

    return updated as BookingSessionProduct;
  }

  /**
   * 세션 상품 삭제
   *
   * 연결된 상담사-상품 매핑(bookingProviderProducts)도 cascade로 삭제됨
   */
  async delete(id: string): Promise<{ success: boolean }> {
    await this.findById(id);

    await this.db
      .delete(bookingSessionProducts)
      .where(eq(bookingSessionProducts.id, id));

    return { success: true };
  }

  /**
   * 세션 상품 상태 토글 (active ↔ inactive)
   */
  async toggleStatus(id: string): Promise<BookingSessionProduct> {
    const product = await this.findById(id);

    const newStatus = product.status === "active" ? "inactive" : "active";

    const [updated] = await this.db
      .update(bookingSessionProducts)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(bookingSessionProducts.id, id))
      .returning();

    return updated as BookingSessionProduct;
  }

  /**
   * 세션 상품 통계
   */
  async getCounts(): Promise<{ total: number; active: number }> {
    const [result] = await this.db
      .select({
        total: count(),
        active:
          sql<number>`count(*) filter (where ${bookingSessionProducts.status} = 'active')`.as(
            "active",
          ),
      })
      .from(bookingSessionProducts);

    return {
      total: result?.total ?? 0,
      active: result?.active ?? 0,
    };
  }

  /**
   * [Admin] 전체 세션 상품 목록 (비활성 포함, 페이지네이션)
   */
  async adminFindAll(input: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<PaginatedResult<BookingSessionProduct>> {
    const { page, limit, search } = input;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(bookingSessionProducts.name, `%${search}%`),
          ilike(bookingSessionProducts.description, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(bookingSessionProducts)
        .where(whereClause)
        .orderBy(
          asc(bookingSessionProducts.sortOrder),
          asc(bookingSessionProducts.name),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingSessionProducts)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: data as BookingSessionProduct[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 상담사가 세션 상품 활성화 (상담사-상품 연결)
   */
  async activateForProvider(
    providerId: string,
    productId: string,
  ): Promise<{ success: boolean }> {
    // 상품 존재 여부 확인
    await this.findById(productId);

    // 이미 연결되어 있는지 확인
    const [existing] = await this.db
      .select()
      .from(bookingProviderProducts)
      .where(
        and(
          eq(bookingProviderProducts.providerId, providerId),
          eq(bookingProviderProducts.productId, productId),
        ),
      )
      .limit(1);

    if (existing) {
      // 이미 존재하면 활성화
      if (existing.isActive) {
        throw new ConflictException("이미 활성화된 상품입니다");
      }

      await this.db
        .update(bookingProviderProducts)
        .set({ isActive: true })
        .where(eq(bookingProviderProducts.id, existing.id));
    } else {
      // 새로 연결
      await this.db.insert(bookingProviderProducts).values({
        providerId,
        productId,
        isActive: true,
      });
    }

    return { success: true };
  }

  /**
   * 상담사가 세션 상품 비활성화
   */
  async deactivateForProvider(
    providerId: string,
    productId: string,
  ): Promise<{ success: boolean }> {
    const [existing] = await this.db
      .select()
      .from(bookingProviderProducts)
      .where(
        and(
          eq(bookingProviderProducts.providerId, providerId),
          eq(bookingProviderProducts.productId, productId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException("해당 상품이 연결되어 있지 않습니다");
    }

    if (!existing.isActive) {
      throw new ConflictException("이미 비활성화된 상품입니다");
    }

    await this.db
      .update(bookingProviderProducts)
      .set({ isActive: false })
      .where(eq(bookingProviderProducts.id, existing.id));

    return { success: true };
  }

  /**
   * 상담사의 활성 상품 목록 조회
   */
  async getProviderProducts(
    providerId: string,
  ): Promise<BookingSessionProduct[]> {
    const rows = await this.db
      .select({
        id: bookingSessionProducts.id,
        name: bookingSessionProducts.name,
        description: bookingSessionProducts.description,
        durationMinutes: bookingSessionProducts.durationMinutes,
        price: bookingSessionProducts.price,
        currency: bookingSessionProducts.currency,
        status: bookingSessionProducts.status,
        sortOrder: bookingSessionProducts.sortOrder,
        createdAt: bookingSessionProducts.createdAt,
        updatedAt: bookingSessionProducts.updatedAt,
      })
      .from(bookingProviderProducts)
      .innerJoin(
        bookingSessionProducts,
        eq(bookingProviderProducts.productId, bookingSessionProducts.id),
      )
      .where(
        and(
          eq(bookingProviderProducts.providerId, providerId),
          eq(bookingProviderProducts.isActive, true),
        ),
      )
      .orderBy(
        asc(bookingSessionProducts.sortOrder),
        asc(bookingSessionProducts.name),
      );

    return rows as BookingSessionProduct[];
  }
}
