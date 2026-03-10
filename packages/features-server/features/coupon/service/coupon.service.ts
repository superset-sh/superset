import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectDrizzle, type DrizzleDB } from "@superbuilder/drizzle";
import { eq, and, desc, sql, count } from "drizzle-orm";
import {
  paymentCoupons,
  paymentCouponRedemptions,
} from "@superbuilder/drizzle";
import { createLogger } from "../../../core/logger";
import type { CreateCouponDto } from "../dto/create-coupon.dto";
import type { UpdateCouponDto } from "../dto/update-coupon.dto";
import type { ValidateCouponDto } from "../dto/validate-coupon.dto";
import type { ApplyCouponDto } from "../dto/apply-coupon.dto";
import type { CouponValidationResult } from "../types";

const logger = createLogger("coupon");

@Injectable()
export class CouponService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  // =========================================================================
  // Admin CRUD
  // =========================================================================

  async create(input: CreateCouponDto, createdBy: string) {
    const existing = await this.db.query.paymentCoupons.findFirst({
      where: eq(paymentCoupons.code, input.code),
    });
    if (existing) {
      throw new ConflictException("이미 존재하는 쿠폰 코드입니다");
    }

    const [coupon] = await this.db
      .insert(paymentCoupons)
      .values({
        ...input,
        startsAt: new Date(input.startsAt),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy,
      })
      .returning();

    logger.info("Coupon created", {
      "coupon.id": coupon!.id,
      "coupon.code": coupon!.code,
      "user.id": createdBy,
    });

    return coupon!;
  }

  async list(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const whereCondition = eq(paymentCoupons.isDeleted, false);

    const [data, totalResult] = await Promise.all([
      this.db.query.paymentCoupons.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: [desc(paymentCoupons.createdAt)],
      }),
      this.db
        .select({ count: count() })
        .from(paymentCoupons)
        .where(whereCondition),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    const coupon = await this.db.query.paymentCoupons.findFirst({
      where: and(
        eq(paymentCoupons.id, id),
        eq(paymentCoupons.isDeleted, false),
      ),
    });
    if (!coupon) {
      throw new NotFoundException("쿠폰을 찾을 수 없습니다");
    }
    return coupon;
  }

  async getByIdWithRedemptions(id: string) {
    const coupon = await this.getById(id);

    const redemptions = await this.db.query.paymentCouponRedemptions.findMany({
      where: eq(paymentCouponRedemptions.couponId, id),
      orderBy: [desc(paymentCouponRedemptions.createdAt)],
    });

    return { ...coupon, redemptions };
  }

  async update(id: string, input: UpdateCouponDto) {
    await this.getById(id);

    const [updated] = await this.db
      .update(paymentCoupons)
      .set({
        ...input,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      })
      .where(eq(paymentCoupons.id, id))
      .returning();

    logger.info("Coupon updated", {
      "coupon.id": id,
      "coupon.code": updated!.code,
    });

    return updated!;
  }

  async deactivate(id: string) {
    await this.getById(id);

    const [updated] = await this.db
      .update(paymentCoupons)
      .set({ isActive: false })
      .where(eq(paymentCoupons.id, id))
      .returning();

    logger.info("Coupon deactivated", {
      "coupon.id": id,
      "coupon.code": updated!.code,
    });

    return updated!;
  }

  async softDelete(id: string) {
    await this.getById(id);

    await this.db
      .update(paymentCoupons)
      .set({ isDeleted: true, isActive: false })
      .where(eq(paymentCoupons.id, id));

    logger.info("Coupon deleted", { "coupon.id": id });

    return { success: true };
  }

  // =========================================================================
  // User: Validate & Apply
  // =========================================================================

  async validate(
    input: ValidateCouponDto,
    userId: string,
  ): Promise<CouponValidationResult> {
    const coupon = await this.db.query.paymentCoupons.findFirst({
      where: eq(paymentCoupons.code, input.code),
    });

    if (!coupon) {
      return { valid: false, error: "유효하지 않은 쿠폰 코드입니다" };
    }
    if (!coupon.isActive || coupon.isDeleted) {
      return { valid: false, error: "사용할 수 없는 쿠폰입니다" };
    }

    const now = new Date();
    if (now < coupon.startsAt) {
      return { valid: false, error: "아직 사용할 수 없는 쿠폰입니다" };
    }
    if (coupon.expiresAt && now > coupon.expiresAt) {
      return { valid: false, error: "만료된 쿠폰입니다" };
    }
    if (
      coupon.maxRedemptions !== null &&
      coupon.currentRedemptions >= coupon.maxRedemptions
    ) {
      return { valid: false, error: "쿠폰 사용 한도에 도달했습니다" };
    }

    // 사용자 중복 확인
    const existingRedemption =
      await this.db.query.paymentCouponRedemptions.findFirst({
        where: and(
          eq(paymentCouponRedemptions.couponId, coupon.id),
          eq(paymentCouponRedemptions.userId, userId),
        ),
      });
    if (existingRedemption) {
      return { valid: false, error: "이미 사용한 쿠폰입니다" };
    }

    // 플랜 호환 확인
    if (
      input.planId &&
      coupon.applicablePlans &&
      coupon.applicablePlans.length > 0 &&
      !coupon.applicablePlans.includes(input.planId)
    ) {
      return {
        valid: false,
        error: "현재 플랜에는 적용할 수 없는 쿠폰입니다",
      };
    }

    return {
      valid: true,
      coupon,
      discountPercent: coupon.discountPercent,
      durationMonths: coupon.durationMonths,
    };
  }

  async apply(input: ApplyCouponDto, userId: string) {
    // 검증
    const validation = await this.validate(
      { code: input.code },
      userId,
    );
    if (!validation.valid || !validation.coupon) {
      throw new BadRequestException(
        validation.error ?? "쿠폰 적용에 실패했습니다",
      );
    }

    const coupon = validation.coupon;

    // 구독에 활성 쿠폰 없는지 확인
    const activeRedemption =
      await this.db.query.paymentCouponRedemptions.findFirst({
        where: and(
          eq(paymentCouponRedemptions.userId, userId),
          eq(paymentCouponRedemptions.subscriptionId, input.subscriptionId),
          eq(paymentCouponRedemptions.status, "active"),
        ),
      });
    if (activeRedemption) {
      throw new ConflictException("이미 적용 중인 쿠폰이 있습니다");
    }

    // 만료일 계산
    const now = new Date();
    const redemptionExpiresAt = new Date(now);
    redemptionExpiresAt.setMonth(
      redemptionExpiresAt.getMonth() + coupon.durationMonths,
    );

    // Redemption 생성
    const [redemption] = await this.db
      .insert(paymentCouponRedemptions)
      .values({
        couponId: coupon.id,
        userId,
        subscriptionId: input.subscriptionId,
        discountPercent: coupon.discountPercent,
        appliedAt: now,
        expiresAt: redemptionExpiresAt,
        status: "active",
      })
      .returning();

    // currentRedemptions 증가
    await this.db
      .update(paymentCoupons)
      .set({
        currentRedemptions: sql`${paymentCoupons.currentRedemptions} + 1`,
      })
      .where(eq(paymentCoupons.id, coupon.id));

    logger.info("Coupon applied", {
      "coupon.id": coupon.id,
      "coupon.code": coupon.code,
      "user.id": userId,
      "coupon.discount_percent": coupon.discountPercent,
    });

    return redemption;
  }

  async getMyRedemption(userId: string) {
    const redemptions =
      await this.db.query.paymentCouponRedemptions.findMany({
        where: and(
          eq(paymentCouponRedemptions.userId, userId),
          eq(paymentCouponRedemptions.status, "active"),
        ),
      });

    // Lazy expiration: 만료된 것 처리
    const now = new Date();
    const result: typeof redemptions = [];
    for (const r of redemptions) {
      if (r.expiresAt <= now) {
        await this.db
          .update(paymentCouponRedemptions)
          .set({ status: "expired" })
          .where(eq(paymentCouponRedemptions.id, r.id));
      } else {
        result.push(r);
      }
    }

    return result;
  }

  async cancel(redemptionId: string, userId: string) {
    const redemption =
      await this.db.query.paymentCouponRedemptions.findFirst({
        where: and(
          eq(paymentCouponRedemptions.id, redemptionId),
          eq(paymentCouponRedemptions.userId, userId),
          eq(paymentCouponRedemptions.status, "active"),
        ),
      });

    if (!redemption) {
      throw new NotFoundException("활성 쿠폰을 찾을 수 없습니다");
    }

    await this.db
      .update(paymentCouponRedemptions)
      .set({ status: "cancelled" })
      .where(eq(paymentCouponRedemptions.id, redemptionId));

    // currentRedemptions 감소
    await this.db
      .update(paymentCoupons)
      .set({
        currentRedemptions: sql`GREATEST(${paymentCoupons.currentRedemptions} - 1, 0)`,
      })
      .where(eq(paymentCoupons.id, redemption.couponId));

    logger.info("Coupon cancelled", {
      "coupon.id": redemption.couponId,
      "user.id": userId,
    });

    return { success: true };
  }
}
