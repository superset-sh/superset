import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { eq, and, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  bookingRefundPolicy,
  bookingBookings,
  bookingProviders,
  type BookingRefundPolicy,
  type BookingBooking,
  type RefundRule,
} from "@superbuilder/drizzle";
import type { z } from "zod";
import type { updateRefundPolicySchema } from "../dto/update-refund-policy.dto";
import type { RefundPreview } from "../types";

type UpdateRefundPolicyInput = z.infer<typeof updateRefundPolicySchema>;

@Injectable()
export class RefundService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  // ===========================================================================
  // 정책 CRUD
  // ===========================================================================

  /**
   * 활성 환불 정책 목록 조회
   */
  async findAllPolicies(): Promise<BookingRefundPolicy[]> {
    const policies = await this.db
      .select()
      .from(bookingRefundPolicy)
      .where(eq(bookingRefundPolicy.isActive, true))
      .orderBy(desc(bookingRefundPolicy.createdAt));

    return policies as BookingRefundPolicy[];
  }

  /**
   * ID로 환불 정책 조회
   */
  async findPolicyById(id: string): Promise<BookingRefundPolicy> {
    const [policy] = await this.db
      .select()
      .from(bookingRefundPolicy)
      .where(eq(bookingRefundPolicy.id, id))
      .limit(1);

    if (!policy) {
      throw new NotFoundException(`환불 정책을 찾을 수 없습니다: ${id}`);
    }

    return policy as BookingRefundPolicy;
  }

  /**
   * 기본 환불 정책 조회 (isDefault=true)
   */
  async getDefaultPolicy(): Promise<BookingRefundPolicy> {
    const [policy] = await this.db
      .select()
      .from(bookingRefundPolicy)
      .where(
        and(
          eq(bookingRefundPolicy.isDefault, true),
          eq(bookingRefundPolicy.isActive, true),
        ),
      )
      .limit(1);

    if (!policy) {
      throw new NotFoundException("기본 환불 정책이 설정되어 있지 않습니다");
    }

    return policy as BookingRefundPolicy;
  }

  /**
   * 환불 정책 생성
   *
   * isDefault=true 설정 시 기존 기본 정책 해제
   */
  async createPolicy(
    dto: UpdateRefundPolicyInput & { isDefault?: boolean },
  ): Promise<BookingRefundPolicy> {
    // isDefault=true로 설정 시 기존 기본 정책 해제
    if (dto.isDefault) {
      await this.db
        .update(bookingRefundPolicy)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(bookingRefundPolicy.isDefault, true));
    }

    const [policy] = await this.db
      .insert(bookingRefundPolicy)
      .values({
        name: dto.name,
        rules: dto.rules,
        noShowRefundPercentage: dto.noShowRefundPercentage,
        providerCancelRefundPercentage: dto.providerCancelRefundPercentage,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
      })
      .returning();

    return policy as BookingRefundPolicy;
  }

  /**
   * 환불 정책 수정
   */
  async updatePolicy(
    id: string,
    dto: UpdateRefundPolicyInput & { isDefault?: boolean },
  ): Promise<BookingRefundPolicy> {
    await this.findPolicyById(id);

    // isDefault=true로 변경 시 기존 기본 정책 해제
    if (dto.isDefault) {
      await this.db
        .update(bookingRefundPolicy)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(bookingRefundPolicy.isDefault, true),
            // 자기 자신 제외
            eq(bookingRefundPolicy.id, id) as unknown as ReturnType<typeof eq>,
          ),
        );

      // 실제로 다른 정책의 isDefault만 해제해야 하므로 별도 처리
      await this.db
        .update(bookingRefundPolicy)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(bookingRefundPolicy.isDefault, true));
    }

    const [updated] = await this.db
      .update(bookingRefundPolicy)
      .set({
        name: dto.name,
        rules: dto.rules,
        noShowRefundPercentage: dto.noShowRefundPercentage,
        providerCancelRefundPercentage: dto.providerCancelRefundPercentage,
        isActive: dto.isActive,
        isDefault: dto.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(bookingRefundPolicy.id, id))
      .returning();

    return updated as BookingRefundPolicy;
  }

  /**
   * 환불 정책 삭제
   *
   * 기본 정책은 삭제 불가
   */
  async deletePolicy(id: string): Promise<{ success: boolean }> {
    const policy = await this.findPolicyById(id);

    if (policy.isDefault) {
      throw new BadRequestException(
        "기본 환불 정책은 삭제할 수 없습니다. 다른 정책을 기본으로 설정한 후 삭제하세요.",
      );
    }

    await this.db
      .update(bookingRefundPolicy)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(bookingRefundPolicy.id, id));

    return { success: true };
  }

  // ===========================================================================
  // 환불 계산
  // ===========================================================================

  /**
   * 환불 미리보기 계산
   *
   * 1. 예약 조회
   * 2. 세션 시작 시각 계산 (sessionDate + startTime)
   * 3. 현재 시각과 차이(시간)
   * 4. 정책 rules에서 적용 규칙 찾기 (hours_before 내림차순)
   * 5. 환불 금액 = paymentAmount * refundPercentage / 100
   */
  async getRefundPreview(bookingId: string): Promise<RefundPreview> {
    const booking = await this.findBookingById(bookingId);

    // 취소 가능한 상태인지 확인
    if (
      booking.status !== "pending_payment" &&
      booking.status !== "confirmed"
    ) {
      throw new BadRequestException(
        `환불이 가능한 상태가 아닙니다. 현재 상태: ${booking.status}`,
      );
    }

    // pending_payment 상태면 100% 환불 (아직 결제 전이므로)
    if (booking.status === "pending_payment") {
      return {
        refundAmount: booking.paymentAmount,
        refundPercentage: 100,
        appliedRule: null,
        reason: "결제 대기 상태 — 전액 환불",
      };
    }

    // 기본 정책 조회
    const policy = await this.getDefaultPolicy();

    // 세션 시작 시각 계산
    const sessionStart = this.calculateSessionStartTime(
      booking.sessionDate,
      booking.startTime,
    );
    const now = new Date();
    const hoursUntilSession =
      (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    // rules를 hours_before 내림차순 정렬하여 적용 규칙 찾기
    const sortedRules = [...policy.rules].sort(
      (a, b) => b.hours_before - a.hours_before,
    );

    let appliedRule: RefundRule | null = null;
    for (const rule of sortedRules) {
      if (hoursUntilSession >= rule.hours_before) {
        appliedRule = rule;
        break;
      }
    }

    if (!appliedRule) {
      // 어떤 규칙에도 해당하지 않는 경우 (세션 시작 이후 등)
      return {
        refundAmount: 0,
        refundPercentage: 0,
        appliedRule: null,
        reason: "환불 기간이 지났습니다",
      };
    }

    const refundPercentage = appliedRule.refund_percentage;
    const refundAmount = Math.floor(
      (booking.paymentAmount * refundPercentage) / 100,
    );

    return {
      refundAmount,
      refundPercentage,
      appliedRule,
      reason: `상담 시작 ${appliedRule.hours_before}시간 전 이상 취소 — ${refundPercentage}% 환불`,
    };
  }

  // ===========================================================================
  // 환불 실행
  // ===========================================================================

  /**
   * 고객 취소 + 환불 처리
   *
   * 1. 본인 예약 확인
   * 2. 상태 확인 (pending_payment 또는 confirmed만 취소 가능)
   * 3. 환불 미리보기 계산
   * 4. 예약 상태 → cancelled_by_user
   * 5. refundAmount, cancelledBy, cancelledAt 저장
   */
  async processCustomerCancellation(
    bookingId: string,
    userId: string,
    reason?: string,
  ): Promise<BookingBooking> {
    const booking = await this.findBookingById(bookingId);

    // 본인 예약 확인
    if (booking.customerId !== userId) {
      throw new ForbiddenException("본인의 예약만 취소할 수 있습니다");
    }

    // 상태 확인
    if (
      booking.status !== "pending_payment" &&
      booking.status !== "confirmed"
    ) {
      throw new BadRequestException(
        `취소가 가능한 상태가 아닙니다. 현재 상태: ${booking.status}`,
      );
    }

    // 환불 계산
    const preview = await this.getRefundPreview(bookingId);

    const [updated] = await this.db
      .update(bookingBookings)
      .set({
        status: "cancelled_by_user",
        refundAmount: preview.refundAmount,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(bookingBookings.id, bookingId))
      .returning();

    return updated as BookingBooking;
  }

  /**
   * 상담사 취소 + 환불 처리
   *
   * 1. 본인 예약 확인 (provider 매칭)
   * 2. 상담사 취소 → providerCancelRefundPercentage에 따른 환불
   * 3. 예약 상태 → cancelled_by_provider
   */
  async processProviderCancellation(
    bookingId: string,
    providerId: string,
    reason?: string,
  ): Promise<BookingBooking> {
    const booking = await this.findBookingById(bookingId);

    // 본인 예약 확인
    if (booking.providerId !== providerId) {
      throw new ForbiddenException("본인의 예약만 취소할 수 있습니다");
    }

    // 상태 확인 (confirmed만 상담사 취소 가능)
    if (booking.status !== "confirmed") {
      throw new BadRequestException(
        `상담사 취소가 가능한 상태가 아닙니다. 현재 상태: ${booking.status}`,
      );
    }

    // 기본 정책에서 상담사 취소 환불 비율 조회
    const policy = await this.getDefaultPolicy();
    const refundPercentage = policy.providerCancelRefundPercentage;
    const refundAmount = Math.floor(
      (booking.paymentAmount * refundPercentage) / 100,
    );

    // 상담사 profileId 조회
    const [provider] = await this.db
      .select({ profileId: bookingProviders.profileId })
      .from(bookingProviders)
      .where(eq(bookingProviders.id, providerId))
      .limit(1);

    const [updated] = await this.db
      .update(bookingBookings)
      .set({
        status: "cancelled_by_provider",
        refundAmount,
        cancelledBy: provider?.profileId ?? null,
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(bookingBookings.id, bookingId))
      .returning();

    return updated as BookingBooking;
  }

  /**
   * Admin 강제 환불 처리
   *
   * 예약 상태 → refunded, 지정된 환불 금액 설정
   */
  async processAdminRefund(
    bookingId: string,
    refundAmount: number,
  ): Promise<BookingBooking> {
    const booking = await this.findBookingById(bookingId);

    // 환불 금액 검증
    if (refundAmount < 0 || refundAmount > booking.paymentAmount) {
      throw new BadRequestException(
        `환불 금액이 유효하지 않습니다. 결제 금액: ${booking.paymentAmount}, 요청 환불 금액: ${refundAmount}`,
      );
    }

    const [updated] = await this.db
      .update(bookingBookings)
      .set({
        status: "refunded",
        refundAmount,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bookingBookings.id, bookingId))
      .returning();

    return updated as BookingBooking;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * 예약 조회 (내부 사용)
   */
  private async findBookingById(id: string): Promise<BookingBooking> {
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
   * sessionDate + startTime → 세션 시작 시각(Date) 계산
   */
  private calculateSessionStartTime(
    sessionDate: Date | string,
    startTime: string,
  ): Date {
    const dateStr =
      typeof sessionDate === "string"
        ? sessionDate
        : formatDateString(sessionDate);

    const parts = startTime.split(":").map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;

    const result = new Date(`${dateStr}T00:00:00`);
    result.setHours(h, m, 0, 0);

    return result;
  }
}

// ===========================================================================
// 모듈 수준 헬퍼 함수
// ===========================================================================

/**
 * Date 객체를 YYYY-MM-DD 형식 문자열로 변환
 */
function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
