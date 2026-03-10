import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, asc } from 'drizzle-orm';
import { paymentPlans, paymentCreditBalances } from '@superbuilder/drizzle';
import type { NewPaymentPlan } from '@superbuilder/drizzle';
import { createLogger } from '../../../core/logger';
import type { PaymentProvider } from '../provider/payment-provider.interface';

const logger = createLogger('payment');

/** provider에 존재하지 않는 로컬 전용 플랜 slug (동기화 시 삭제 보호) */
const LOCAL_ONLY_SLUGS = new Set(['free', 'enterprise']);

/** 새 플랜 생성 시 tier별 기본 월간 크레딧 (provider에 크레딧 정보가 없으므로 로컬 기본값 사용) */
const DEFAULT_MONTHLY_CREDITS: Record<string, number> = {
  free: 100,
  pro: 10000,
  team: 50000,
  enterprise: 0,
};

@Injectable()
export class PlanService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 활성 플랜 목록 조회
   */
  async getPlans() {
    return this.db.query.paymentPlans.findMany({
      where: eq(paymentPlans.isActive, true),
      orderBy: [asc(paymentPlans.sortOrder)],
    });
  }

  /**
   * 전체 플랜 목록 조회 (비활성 포함, Admin용)
   */
  async getAllPlans() {
    return this.db.query.paymentPlans.findMany({
      orderBy: [asc(paymentPlans.sortOrder)],
    });
  }

  /**
   * 플랜 상세 조회
   */
  async getPlanById(id: string) {
    const plan = await this.db.query.paymentPlans.findFirst({
      where: eq(paymentPlans.id, id),
    });

    if (!plan) {
      throw new NotFoundException(`Plan not found: ${id}`);
    }

    return plan;
  }

  /**
   * 플랜 생성
   */
  async createPlan(input: Omit<NewPaymentPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const [plan] = await this.db
      .insert(paymentPlans)
      .values(input)
      .returning();

    return plan;
  }

  /**
   * 플랜 수정
   */
  async updatePlan(id: string, input: Partial<Omit<NewPaymentPlan, 'id' | 'createdAt' | 'updatedAt'>>) {
    await this.getPlanById(id);

    const [updated] = await this.db
      .update(paymentPlans)
      .set(input)
      .where(eq(paymentPlans.id, id))
      .returning();

    return updated;
  }

  /**
   * 프로바이더 상품/변형(variants) → paymentPlans 동기화
   * - variant ID 매칭 → product name 매칭 → 새 플랜 생성
   * - price-model에서 실제 가격/scheme 조회 (volume → isPerSeat, tiers 가격 사용)
   * - provider에 없는 유료 플랜 삭제 (Free 제외)
   * - provider price(cents)를 실제 금액으로 변환하여 저장 (/ 100)
   */
  async syncPlansFromProvider(provider: PaymentProvider) {
    const providerName = provider.providerName;
    const [productList, currency] = await Promise.all([
      provider.getProducts(),
      provider.getStoreCurrency(),
    ]);
    const result = { created: 0, updated: 0, deleted: 0 };

    // 동기화된 플랜 ID 수집 (삭제 판별용)
    const syncedPlanIds: string[] = [];

    for (const product of productList) {
      const variants = await provider.getVariants(product.externalId);

      for (const variant of variants) {
        const productName = product.name;

        // price-model 조회로 실제 가격/scheme 확인
        const priceModel = await provider.getVariantPriceModel(variant.externalId);

        // 실제 가격 결정: volume/graduated → tiers[0].unitPrice, 그 외 → price-model unitPrice
        let actualPrice = variant.price;
        let isPerSeat = false;

        if (priceModel) {
          const scheme = priceModel.scheme;
          if ((scheme === 'volume' || scheme === 'graduated') && priceModel.tiers?.length) {
            actualPrice = priceModel.tiers[0]!.unitPrice;
            isPerSeat = true;
          } else {
            actualPrice = priceModel.unitPrice;
          }
        }

        // provider API는 모든 가격을 cents(x100)로 반환 — 실제 금액으로 변환
        actualPrice = Math.round(actualPrice / 100);

        const interval = priceModel?.renewalIntervalUnit ?? variant.interval ?? 'month';

        // 1. variant ID로 매칭
        let existing = await this.db.query.paymentPlans.findFirst({
          where: eq(paymentPlans.providerVariantId, variant.externalId),
        });

        // 2. 없으면 product name으로 매칭 (기존 플랜에 provider 연동)
        if (!existing) {
          existing = await this.db.query.paymentPlans.findFirst({
            where: eq(paymentPlans.name, productName),
          });
        }

        if (existing) {
          await this.db
            .update(paymentPlans)
            .set({
              name: productName,
              price: actualPrice,
              currency,
              interval,
              isPerSeat,
              providerProductId: product.externalId,
              providerVariantId: variant.externalId,
              provider: providerName,
            })
            .where(eq(paymentPlans.id, existing.id));
          syncedPlanIds.push(existing.id);
          result.updated++;
        } else {
          const slug = productName
            .toLowerCase()
            .replace(/[^a-z0-9가-힣]+/g, '-')
            .replace(/(^-|-$)/g, '');

          // provider 상품명 기반 tier 추정 (정확한 매칭은 Admin에서 수동 설정)
          const inferredTier = this.inferTier(productName);

          const [created] = await this.db.insert(paymentPlans).values({
            name: productName,
            slug,
            tier: inferredTier,
            monthlyCredits: DEFAULT_MONTHLY_CREDITS[inferredTier] ?? 0,
            price: actualPrice,
            currency,
            interval,
            isPerSeat,
            providerProductId: product.externalId,
            providerVariantId: variant.externalId,
            provider: providerName,
            isActive: true,
            sortOrder: variant.sort,
          }).returning();
          if (created) syncedPlanIds.push(created.id);
          result.created++;
        }
      }
    }

    // provider에 없는 플랜 삭제 (로컬 전용 플랜은 보호: provider variant 미연동)
    const allPlans = await this.db.query.paymentPlans.findMany();
    const toDelete = allPlans.filter(
      (p) => !LOCAL_ONLY_SLUGS.has(p.slug) && p.providerVariantId && !syncedPlanIds.includes(p.id),
    );

    for (const plan of toDelete) {
      await this.db.delete(paymentPlans).where(eq(paymentPlans.id, plan.id));
    }
    result.deleted = toDelete.length;

    logger.info('Plans synced from provider', {
      'payment.provider': providerName,
      'payment.plans_created': result.created,
      'payment.plans_updated': result.updated,
      'payment.plans_deleted': result.deleted,
    });

    return result;
  }

  /**
   * DB 플랜 → 프로바이더 동기화 (Push)
   * - provider variant ID가 있는 플랜 → provider variant 가격/이름 업데이트
   * - provider variant ID가 없는 플랜 → 스킵 (일부 provider API는 Product 생성 미지원)
   * - Free 플랜(price=0)은 스킵
   *
   * Note: 일부 provider API는 Product/Variant 생성을 지원하지 않음 (읽기 + Variant PATCH만 가능).
   * 새 상품은 provider 대시보드에서 먼저 생성한 뒤, "Provider → DB" 동기화로 연결해야 합니다.
   */
  async pushPlansToProvider(provider: PaymentProvider) {
    const providerName = provider.providerName;
    const allPlans = await this.db.query.paymentPlans.findMany({
      orderBy: [asc(paymentPlans.sortOrder)],
    });

    const result = { updated: 0, skipped: 0, notLinked: 0 };

    for (const plan of allPlans) {
      // Free 플랜은 provider에 올리지 않음
      if (plan.price === 0) {
        result.skipped++;
        continue;
      }

      if (plan.providerVariantId) {
        // 기존 연결된 variant → 가격/이름 업데이트
        try {
          await provider.updateVariant?.(plan.providerVariantId, {
            name: plan.name,
            price: plan.price,
            is_subscription: true,
            interval: plan.interval ?? 'month',
            interval_count: 1,
          });
          result.updated++;
        } catch (error) {
          logger.error('Provider variant update failed', {
            'payment.plan_name': plan.name,
            'payment.variant_id': plan.providerVariantId,
            'payment.provider': providerName,
            'error.type': error instanceof Error ? error.constructor.name : 'Unknown',
            'error.message': error instanceof Error ? error.message : String(error),
          });
          result.skipped++;
        }
      } else {
        // provider 미연동 플랜 — API로 Product 생성 불가
        result.notLinked++;
      }
    }

    logger.info('Plans pushed to provider', {
      'payment.provider': providerName,
      'payment.plans_updated': result.updated,
      'payment.plans_skipped': result.skipped,
      'payment.plans_not_linked': result.notLinked,
    });

    return result;
  }

  /**
   * Free 플랜 시드 (없으면 생성, 있으면 스킵)
   * - slug 'free'로 존재 여부 판별
   * - 시스템 기본 플랜이므로 삭제 불가
   */
  async seedFreePlan() {
    const existing = await this.db.query.paymentPlans.findFirst({
      where: eq(paymentPlans.slug, 'free'),
    });

    if (existing) {
      return { created: false, plan: existing };
    }

    const [plan] = await this.db
      .insert(paymentPlans)
      .values({
        name: 'Free',
        slug: 'free',
        description: '무료 플랜 — 기본 기능과 제한된 크레딧',
        tier: 'free',
        monthlyCredits: 100,
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: ['기본 기능', '월 100 크레딧', '커뮤니티 지원'],
        isActive: true,
        sortOrder: 0,
      })
      .returning();

    return { created: true, plan };
  }

  /**
   * Enterprise 플랜 시드 (없으면 생성, 있으면 스킵)
   * - 계약 기반 운용, provider 미연동 로컬 전용 플랜
   */
  async seedEnterprisePlan() {
    const existing = await this.db.query.paymentPlans.findFirst({
      where: eq(paymentPlans.slug, 'enterprise'),
    });

    if (existing) {
      return { created: false, plan: existing };
    }

    const [plan] = await this.db
      .insert(paymentPlans)
      .values({
        name: 'Enterprise',
        slug: 'enterprise',
        description: '대규모 팀을 위한 맞춤형 플랜',
        tier: 'enterprise',
        monthlyCredits: 0,
        price: 0,
        currency: 'KRW',
        interval: 'month',
        features: ['무제한 크레딧', '전담 매니저', '맞춤 SLA', 'SSO/SAML 지원', '온프레미스 배포 가능'],
        isActive: true,
        sortOrder: 99,
      })
      .returning();

    return { created: true, plan };
  }

  /**
   * 사용자에게 플랜 할당
   * - 기존 레코드가 있으면 업데이트, 없으면 생성
   * - monthlyCredits를 balance로 설정
   * - currentPeriodEnd = 다음 달 같은 날짜
   */
  async assignPlanToUser(userId: string, planId: string) {
    const plan = await this.getPlanById(planId);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [result] = await this.db
      .insert(paymentCreditBalances)
      .values({
        userId,
        planId,
        balance: plan.monthlyCredits,
        monthlyAllocation: plan.monthlyCredits,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: paymentCreditBalances.userId,
        set: {
          planId,
          balance: plan.monthlyCredits,
          monthlyAllocation: plan.monthlyCredits,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      })
      .returning();

    return result;
  }

  /**
   * provider 상품명으로 tier 추정
   * - 정확한 매칭은 Admin에서 수동 설정 가능
   */
  private inferTier(productName: string): 'free' | 'pro' | 'team' | 'enterprise' {
    const lower = productName.toLowerCase();
    if (lower.includes('team')) return 'team';
    if (lower.includes('enterprise')) return 'enterprise';
    if (lower.includes('free')) return 'free';
    return 'pro';
  }
}
