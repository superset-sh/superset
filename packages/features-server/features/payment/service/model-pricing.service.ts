import { Injectable } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq } from 'drizzle-orm';
import { paymentModelPricing } from '@superbuilder/drizzle';
import type { NewPaymentModelPricing } from '@superbuilder/drizzle';

@Injectable()
export class ModelPricingService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 활성 모델 가격 목록 조회
   */
  async getPricingList() {
    return this.db.query.paymentModelPricing.findMany({
      where: eq(paymentModelPricing.isActive, true),
    });
  }

  /**
   * 모델 가격 upsert
   * - modelId unique 기준 insert or update
   */
  async upsertPricing(input: Omit<NewPaymentModelPricing, 'id' | 'createdAt' | 'updatedAt'>) {
    const [result] = await this.db
      .insert(paymentModelPricing)
      .values(input)
      .onConflictDoUpdate({
        target: paymentModelPricing.modelId,
        set: {
          provider: input.provider,
          displayName: input.displayName,
          inputCreditsPerKToken: input.inputCreditsPerKToken,
          outputCreditsPerKToken: input.outputCreditsPerKToken,
          isActive: input.isActive,
        },
      })
      .returning();

    return result;
  }
}
