import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { eq, and, desc, count, sql, lt, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  bookingBookings,
  bookingProviders,
  bookingSessionProducts,
  profiles,
  type BookingBooking,
  type BookingStatus,
} from "@superbuilder/drizzle";
import type { z } from "zod";
import type { createBookingSchema } from "../dto/create-booking.dto";
import type { bookingQuerySchema } from "../dto/booking-query.dto";
import type {
  BookingWithDetails,
  AdminBookingListItem,
  PaginatedResult,
} from "../types";

type CreateBookingInput = z.infer<typeof createBookingSchema>;
type BookingQueryInput = z.infer<typeof bookingQuerySchema>;

// 유효한 상태 전이 맵
const VALID_TRANSITIONS: Record<string, BookingStatus[]> = {
  pending_payment: ["confirmed", "expired", "cancelled_by_user"],
  confirmed: [
    "completed",
    "no_show",
    "cancelled_by_user",
    "cancelled_by_provider",
  ],
  cancelled_by_user: ["refunded"],
  cancelled_by_provider: ["refunded"],
};

@Injectable()
export class BookingService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  // ===========================================================================
  // 예약 생성
  // ===========================================================================

  /**
   * 예약 생성
   *
   * 1. 상담사 존재 + active 확인
   * 2. 상품 존재 + active 확인
   * 3. 슬롯 가용 확인 (시간 겹침 체크)
   * 4. endTime 계산, paymentAmount = 상품 가격
   * 5. status: pending_payment, slotLockedUntil: 현재 + 15분
   */
  async create(
    userId: string,
    dto: CreateBookingInput,
  ): Promise<BookingBooking> {
    // 상담사 존재 + active 확인
    const [provider] = await this.db
      .select()
      .from(bookingProviders)
      .where(eq(bookingProviders.id, dto.providerId))
      .limit(1);

    if (!provider) {
      throw new NotFoundException(
        `상담사를 찾을 수 없습니다: ${dto.providerId}`,
      );
    }

    if (provider.status !== "active") {
      throw new BadRequestException("비활성 상담사에게는 예약할 수 없습니다");
    }

    // 상품 존재 + active 확인
    const [product] = await this.db
      .select()
      .from(bookingSessionProducts)
      .where(eq(bookingSessionProducts.id, dto.productId))
      .limit(1);

    if (!product) {
      throw new NotFoundException(
        `세션 상품을 찾을 수 없습니다: ${dto.productId}`,
      );
    }

    if (product.status !== "active") {
      throw new BadRequestException("비활성 상품으로는 예약할 수 없습니다");
    }

    // endTime 계산
    const endTime = this.calculateEndTime(
      dto.startTime,
      product.durationMinutes,
    );

    // 슬롯 충돌 확인
    const hasConflict = await this.isSlotConflict(
      dto.providerId,
      dto.sessionDate,
      dto.startTime,
      endTime,
    );

    if (hasConflict) {
      throw new ConflictException(
        "해당 시간대에 이미 예약이 존재합니다",
      );
    }

    // slotLockedUntil: 현재 + 15분
    const slotLockedUntil = new Date(Date.now() + 15 * 60 * 1000);

    const [booking] = await this.db
      .insert(bookingBookings)
      .values({
        customerId: userId,
        providerId: dto.providerId,
        productId: dto.productId,
        sessionDate: new Date(dto.sessionDate),
        startTime: dto.startTime,
        endTime,
        status: "pending_payment",
        consultationMode: dto.consultationMode,
        paymentAmount: product.price,
        slotLockedUntil,
      })
      .returning();

    return booking as BookingBooking;
  }

  // ===========================================================================
  // 결제 확인
  // ===========================================================================

  /**
   * 결제 확인 → confirmed 상태로 전이
   */
  async confirmPayment(
    bookingId: string,
    paymentReference: string,
  ): Promise<BookingBooking> {
    const booking = await this.findById(bookingId);

    if (booking.status !== "pending_payment") {
      throw new BadRequestException(
        `결제 확인이 가능한 상태가 아닙니다. 현재 상태: ${booking.status}`,
      );
    }

    const [updated] = await this.db
      .update(bookingBookings)
      .set({
        status: "confirmed",
        paymentReference,
        updatedAt: new Date(),
      })
      .where(eq(bookingBookings.id, bookingId))
      .returning();

    return updated as BookingBooking;
  }

  // ===========================================================================
  // 상태 전이 (State Machine)
  // ===========================================================================

  /**
   * 예약 상태 변경 (State Machine 검증)
   */
  async updateStatus(
    bookingId: string,
    newStatus: BookingStatus,
    options?: {
      cancelledBy?: string;
      cancellationReason?: string;
    },
  ): Promise<BookingBooking> {
    const booking = await this.findById(bookingId);
    const currentStatus = booking.status;

    // 상태 전이 유효성 검증
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `상태 전이가 유효하지 않습니다: ${currentStatus} → ${newStatus}`,
      );
    }

    // 상태별 추가 필드 설정
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (
      newStatus === "cancelled_by_user" ||
      newStatus === "cancelled_by_provider"
    ) {
      updateData.cancelledAt = new Date();
      if (options?.cancelledBy) {
        updateData.cancelledBy = options.cancelledBy;
      }
      if (options?.cancellationReason) {
        updateData.cancellationReason = options.cancellationReason;
      }
    }

    if (newStatus === "completed") {
      updateData.completedAt = new Date();
    }

    if (newStatus === "refunded") {
      updateData.refundedAt = new Date();
    }

    const [updated] = await this.db
      .update(bookingBookings)
      .set(updateData)
      .where(eq(bookingBookings.id, bookingId))
      .returning();

    return updated as BookingBooking;
  }

  // ===========================================================================
  // 완료 / 노쇼
  // ===========================================================================

  /**
   * 세션 완료 처리: confirmed → completed
   */
  async completeSession(bookingId: string): Promise<BookingBooking> {
    return this.updateStatus(bookingId, "completed");
  }

  /**
   * 노쇼 처리: confirmed → no_show
   */
  async markNoShow(bookingId: string): Promise<BookingBooking> {
    return this.updateStatus(bookingId, "no_show");
  }

  // ===========================================================================
  // 조회
  // ===========================================================================

  /**
   * ID로 예약 조회 (기본 정보)
   */
  async findById(id: string): Promise<BookingBooking> {
    const [booking] = await this.db
      .select()
      .from(bookingBookings)
      .where(eq(bookingBookings.id, id))
      .limit(1);

    if (!booking) {
      throw new NotFoundException(`예약을 찾을 수 없습니다: ${id}`);
    }

    return booking as BookingBooking;
  }

  /**
   * 예약 상세 조회 (고객 + 상담사 + 상품 정보 포함)
   */
  async getBookingWithDetails(id: string): Promise<BookingWithDetails> {
    // bookingBookings JOIN profiles(customer) JOIN bookingProviders JOIN profiles(provider) JOIN bookingSessionProducts
    const [row] = await this.db
      .select({
        id: bookingBookings.id,
        customerId: bookingBookings.customerId,
        customerName: profiles.name,
        customerEmail: profiles.email,
        customerAvatar: profiles.avatar,
        providerId: bookingBookings.providerId,
        productId: bookingBookings.productId,
        sessionDate: bookingBookings.sessionDate,
        startTime: bookingBookings.startTime,
        endTime: bookingBookings.endTime,
        status: bookingBookings.status,
        consultationMode: bookingBookings.consultationMode,
        meetingLink: bookingBookings.meetingLink,
        location: bookingBookings.location,
        paymentAmount: bookingBookings.paymentAmount,
        refundAmount: bookingBookings.refundAmount,
        cancellationReason: bookingBookings.cancellationReason,
        createdAt: bookingBookings.createdAt,
      })
      .from(bookingBookings)
      .innerJoin(profiles, eq(bookingBookings.customerId, profiles.id))
      .where(eq(bookingBookings.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`예약을 찾을 수 없습니다: ${id}`);
    }

    // 상담사 프로필 조회 (provider -> profiles)
    const [providerProfile] = await this.db
      .select({
        name: profiles.name,
        avatar: profiles.avatar,
      })
      .from(bookingProviders)
      .innerJoin(profiles, eq(bookingProviders.profileId, profiles.id))
      .where(eq(bookingProviders.id, row.providerId))
      .limit(1);

    // 상품 조회
    const [product] = await this.db
      .select({
        name: bookingSessionProducts.name,
        durationMinutes: bookingSessionProducts.durationMinutes,
      })
      .from(bookingSessionProducts)
      .where(eq(bookingSessionProducts.id, row.productId))
      .limit(1);

    return {
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerAvatar: row.customerAvatar,
      providerId: row.providerId,
      providerName: providerProfile?.name ?? "알 수 없음",
      providerAvatar: providerProfile?.avatar ?? null,
      productId: row.productId,
      productName: product?.name ?? "알 수 없음",
      durationMinutes: product?.durationMinutes ?? 0,
      sessionDate: formatDateFromValue(row.sessionDate),
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
      consultationMode: row.consultationMode,
      meetingLink: row.meetingLink,
      location: row.location,
      paymentAmount: row.paymentAmount,
      refundAmount: row.refundAmount,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 고객의 예약 목록 (페이지네이션, 상태 필터)
   */
  async getCustomerBookings(
    userId: string,
    query: BookingQueryInput,
  ): Promise<PaginatedResult<BookingBooking>> {
    const { page, limit, status, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [
      eq(bookingBookings.customerId, userId),
    ];

    if (status) {
      conditions.push(eq(bookingBookings.status, status));
    }
    if (dateFrom) {
      conditions.push(
        sql`${bookingBookings.sessionDate} >= ${dateFrom}` as ReturnType<
          typeof eq
        >,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${bookingBookings.sessionDate} <= ${dateTo}` as ReturnType<
          typeof eq
        >,
      );
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(bookingBookings)
        .where(whereClause)
        .orderBy(desc(bookingBookings.sessionDate))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingBookings)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: data as BookingBooking[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 상담사의 예약 목록 (페이지네이션, 상태 필터)
   */
  async getProviderBookings(
    providerId: string,
    query: BookingQueryInput,
  ): Promise<PaginatedResult<BookingBooking>> {
    const { page, limit, status, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [
      eq(bookingBookings.providerId, providerId),
    ];

    if (status) {
      conditions.push(eq(bookingBookings.status, status));
    }
    if (dateFrom) {
      conditions.push(
        sql`${bookingBookings.sessionDate} >= ${dateFrom}` as ReturnType<
          typeof eq
        >,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${bookingBookings.sessionDate} <= ${dateTo}` as ReturnType<
          typeof eq
        >,
      );
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(bookingBookings)
        .where(whereClause)
        .orderBy(desc(bookingBookings.sessionDate))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingBookings)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: data as BookingBooking[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * [Admin] 전체 예약 목록 (페이지네이션, 상태 필터)
   */
  async adminFindAll(
    query: BookingQueryInput,
  ): Promise<PaginatedResult<BookingBooking>> {
    const { page, limit, status, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (status) {
      conditions.push(eq(bookingBookings.status, status));
    }
    if (dateFrom) {
      conditions.push(
        sql`${bookingBookings.sessionDate} >= ${dateFrom}` as ReturnType<
          typeof eq
        >,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${bookingBookings.sessionDate} <= ${dateTo}` as ReturnType<
          typeof eq
        >,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(bookingBookings)
        .where(whereClause)
        .orderBy(desc(bookingBookings.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingBookings)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: data as BookingBooking[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * [Admin] 전체 예약 목록 (고객/상담사/상품 이름 포함)
   */
  async adminFindAllWithDetails(
    query: BookingQueryInput,
  ): Promise<PaginatedResult<AdminBookingListItem>> {
    const { page, limit, status, dateFrom, dateTo } = query;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (status) {
      conditions.push(eq(bookingBookings.status, status));
    }
    if (dateFrom) {
      conditions.push(
        sql`${bookingBookings.sessionDate} >= ${dateFrom}` as ReturnType<
          typeof eq
        >,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${bookingBookings.sessionDate} <= ${dateTo}` as ReturnType<
          typeof eq
        >,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rawData, totalResult] = await Promise.all([
      this.db
        .select()
        .from(bookingBookings)
        .where(whereClause)
        .orderBy(desc(bookingBookings.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(bookingBookings)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    if (rawData.length === 0) {
      return {
        data: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // 관련 ID 수집
    const customerIds = [...new Set(rawData.map((b) => b.customerId))];
    const providerIds = [...new Set(rawData.map((b) => b.providerId))];
    const productIds = [...new Set(rawData.map((b) => b.productId))];

    // 배치 조회
    const [customerNames, providerNames, productNames] = await Promise.all([
      this.batchGetCustomerNames(customerIds),
      this.batchGetProviderNames(providerIds),
      this.batchGetProductNames(productIds),
    ]);

    const data: AdminBookingListItem[] = rawData.map((booking) => ({
      id: booking.id,
      customerId: booking.customerId,
      customerName: customerNames.get(booking.customerId) ?? "알 수 없음",
      providerId: booking.providerId,
      providerName: providerNames.get(booking.providerId) ?? "알 수 없음",
      productId: booking.productId,
      productName: productNames.get(booking.productId) ?? "알 수 없음",
      sessionDate: formatDateFromValue(booking.sessionDate),
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      consultationMode: booking.consultationMode,
      paymentAmount: booking.paymentAmount,
      refundAmount: booking.refundAmount,
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
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
   * [Admin] 예약 상태별 통계
   */
  async getBookingStatusCounts(): Promise<{
    total: number;
    today: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    refunded: number;
    noShow: number;
    totalRevenue: number;
  }> {
    const [statusResult, revenueResult, todayResult] = await Promise.all([
      this.db
        .select({
          total: count(),
          pending:
            sql<number>`count(*) filter (where ${bookingBookings.status} = 'pending_payment')`.as(
              "pending",
            ),
          confirmed:
            sql<number>`count(*) filter (where ${bookingBookings.status} = 'confirmed')`.as(
              "confirmed",
            ),
          completed:
            sql<number>`count(*) filter (where ${bookingBookings.status} = 'completed')`.as(
              "completed",
            ),
          cancelled:
            sql<number>`count(*) filter (where ${bookingBookings.status} in ('cancelled_by_user', 'cancelled_by_provider'))`.as(
              "cancelled",
            ),
          refunded:
            sql<number>`count(*) filter (where ${bookingBookings.status} = 'refunded')`.as(
              "refunded",
            ),
          noShow:
            sql<number>`count(*) filter (where ${bookingBookings.status} = 'no_show')`.as(
              "no_show",
            ),
        })
        .from(bookingBookings),
      this.db
        .select({
          total:
            sql<number>`coalesce(sum(${bookingBookings.paymentAmount}), 0)`.as(
              "total",
            ),
        })
        .from(bookingBookings)
        .where(eq(bookingBookings.status, "completed")),
      this.db
        .select({ count: count() })
        .from(bookingBookings)
        .where(
          sql`${bookingBookings.sessionDate}::date = current_date` as ReturnType<
            typeof eq
          >,
        ),
    ]);

    const s = statusResult[0];
    return {
      total: s?.total ?? 0,
      today: todayResult[0]?.count ?? 0,
      pending: s?.pending ?? 0,
      confirmed: s?.confirmed ?? 0,
      completed: s?.completed ?? 0,
      cancelled: s?.cancelled ?? 0,
      refunded: s?.refunded ?? 0,
      noShow: s?.noShow ?? 0,
      totalRevenue: revenueResult[0]?.total ?? 0,
    };
  }

  // ===========================================================================
  // TTL 만료 처리
  // ===========================================================================

  /**
   * 슬롯 잠금 TTL 초과 예약 일괄 만료 처리
   *
   * status='pending_payment' AND slotLockedUntil < now() → expired
   */
  async expireTimedOutBookings(): Promise<number> {
    const now = new Date();

    const result = await this.db
      .update(bookingBookings)
      .set({
        status: "expired",
        updatedAt: now,
      })
      .where(
        and(
          eq(bookingBookings.status, "pending_payment"),
          lt(bookingBookings.slotLockedUntil, now),
        ),
      )
      .returning({ id: bookingBookings.id });

    return result.length;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * 배치 고객 이름 조회
   */
  private async batchGetCustomerNames(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(inArray(profiles.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * 배치 상담사 이름 조회 (provider → profile)
   */
  private async batchGetProviderNames(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ providerId: bookingProviders.id, name: profiles.name })
      .from(bookingProviders)
      .innerJoin(profiles, eq(bookingProviders.profileId, profiles.id))
      .where(inArray(bookingProviders.id, ids));
    return new Map(rows.map((r) => [r.providerId, r.name]));
  }

  /**
   * 배치 상품 이름 조회
   */
  private async batchGetProductNames(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: bookingSessionProducts.id,
        name: bookingSessionProducts.name,
      })
      .from(bookingSessionProducts)
      .where(inArray(bookingSessionProducts.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * 슬롯 충돌 확인
   *
   * 동일 provider + sessionDate + 시간 겹침 + status IN ('pending_payment', 'confirmed')
   */
  private async isSlotConflict(
    providerId: string,
    sessionDate: string,
    startTime: string,
    endTime: string,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const conditions = [
      eq(bookingBookings.providerId, providerId),
      eq(bookingBookings.sessionDate, new Date(sessionDate)),
      sql`${bookingBookings.status} IN ('pending_payment', 'confirmed')`,
      // 시간 겹침: start_a < end_b AND start_b < end_a
      sql`${bookingBookings.startTime} < ${endTime}::time`,
      sql`${bookingBookings.endTime} > ${startTime}::time`,
    ];

    if (excludeBookingId) {
      conditions.push(
        sql`${bookingBookings.id} != ${excludeBookingId}` as ReturnType<
          typeof eq
        >,
      );
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(bookingBookings)
      .where(and(...(conditions as ReturnType<typeof eq>[])));

    return (result?.count ?? 0) > 0;
  }

  /**
   * startTime + durationMinutes → endTime (HH:MM) 계산
   */
  private calculateEndTime(
    startTime: string,
    durationMinutes: number,
  ): string {
    const parts = startTime.split(":").map(Number);
    const startH = parts[0] ?? 0;
    const startM = parts[1] ?? 0;
    const totalMinutes = startH * 60 + startM + durationMinutes;
    const endH = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, "0");
    const endM = (totalMinutes % 60).toString().padStart(2, "0");
    return `${endH}:${endM}`;
  }
}

// ===========================================================================
// 모듈 수준 헬퍼 함수
// ===========================================================================

/**
 * Date 또는 string 값을 YYYY-MM-DD 문자열로 변환
 */
function formatDateFromValue(value: Date | string): string {
  if (typeof value === "string") return value;
  const y = value.getFullYear();
  const m = (value.getMonth() + 1).toString().padStart(2, "0");
  const d = value.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
