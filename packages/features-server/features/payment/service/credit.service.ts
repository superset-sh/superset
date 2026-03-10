import { Injectable, BadRequestException } from '@nestjs/common';
import { buildPaginatedResult } from '../../../shared/utils/offset-pagination';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, desc, count } from 'drizzle-orm';
import {
  paymentCreditBalances,
  paymentCreditTransactions,
  paymentModelPricing,
} from '@superbuilder/drizzle';
import type { PaymentCreditBalance } from '@superbuilder/drizzle';

@Injectable()
export class CreditService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * 잔액 조회
   * - 없으면 기본값(0) 레코드 자동 생성
   */
  async getBalance(userId: string): Promise<PaymentCreditBalance> {
    const existing = await this.db.query.paymentCreditBalances.findFirst({
      where: eq(paymentCreditBalances.userId, userId),
    });

    if (existing) return existing;

    // 기본 잔액 레코드 생성
    const [created] = await this.db
      .insert(paymentCreditBalances)
      .values({
        userId,
        balance: 0,
        monthlyAllocation: 0,
      })
      .onConflictDoUpdate({
        target: paymentCreditBalances.userId,
        set: {},
      })
      .returning();

    return created!;
  }

  /**
   * 잔액 충분 여부 확인
   */
  async checkBalance(userId: string, estimatedCredits: number) {
    const balanceRecord = await this.getBalance(userId);

    return {
      sufficient: balanceRecord.balance >= estimatedCredits,
      currentBalance: balanceRecord.balance,
      estimatedCost: estimatedCredits,
      remaining: balanceRecord.balance - estimatedCredits,
    };
  }

  /**
   * 크레딧 차감
   * - 트랜잭션으로 잔액 차감 + 로그 기록
   * - 잔액 부족 시 BadRequestException
   */
  async deductCredits(
    userId: string,
    amount: number,
    metadata?: {
      modelId?: string;
      provider?: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      messageId?: string;
      threadId?: string;
    },
  ) {
    return this.db.transaction(async (tx) => {
      // 현재 잔액 조회
      const balanceRecord = await tx.query.paymentCreditBalances.findFirst({
        where: eq(paymentCreditBalances.userId, userId),
      });

      if (!balanceRecord) {
        throw new BadRequestException('크레딧 잔액 레코드가 없습니다.');
      }

      if (balanceRecord.balance < amount) {
        throw new BadRequestException(
          `크레딧이 부족합니다. 현재: ${balanceRecord.balance}, 필요: ${amount}`,
        );
      }

      const balanceBefore = balanceRecord.balance;
      const balanceAfter = balanceBefore - amount;

      // 잔액 차감
      await tx
        .update(paymentCreditBalances)
        .set({ balance: balanceAfter })
        .where(eq(paymentCreditBalances.userId, userId));

      // 트랜잭션 로그 기록
      const [transaction] = await tx
        .insert(paymentCreditTransactions)
        .values({
          userId,
          type: 'deduction',
          amount: -amount,
          balanceBefore,
          balanceAfter,
          description: metadata?.modelId
            ? `AI 모델 사용: ${metadata.modelId}`
            : '크레딧 차감',
          metadata: metadata ?? null,
        })
        .returning();

      return {
        transaction,
        balanceBefore,
        balanceAfter,
      };
    });
  }

  /**
   * 크레딧 추가
   * - allocation / purchase / refund / adjustment 타입 지원
   */
  async addCredits(
    userId: string,
    amount: number,
    type: 'allocation' | 'purchase' | 'refund' | 'adjustment',
    description?: string,
    relatedOrderId?: string,
  ) {
    return this.db.transaction(async (tx) => {
      // 현재 잔액 조회 (없으면 생성)
      let balanceRecord = await tx.query.paymentCreditBalances.findFirst({
        where: eq(paymentCreditBalances.userId, userId),
      });

      if (!balanceRecord) {
        const [created] = await tx
          .insert(paymentCreditBalances)
          .values({
            userId,
            balance: 0,
            monthlyAllocation: 0,
          })
          .returning();
        balanceRecord = created!;
      }

      const balanceBefore = balanceRecord!.balance;
      const balanceAfter = balanceBefore + amount;

      // 잔액 증가
      await tx
        .update(paymentCreditBalances)
        .set({ balance: balanceAfter })
        .where(eq(paymentCreditBalances.userId, userId));

      // 트랜잭션 로그 기록
      const [transaction] = await tx
        .insert(paymentCreditTransactions)
        .values({
          userId,
          type,
          amount,
          balanceBefore,
          balanceAfter,
          description,
          relatedOrderId: relatedOrderId ?? null,
        })
        .returning();

      return {
        transaction,
        balanceBefore,
        balanceAfter,
      };
    });
  }

  /**
   * 트랜잭션 내역 페이지네이션
   */
  async getTransactions(userId: string, input: { page: number; limit: number }) {
    const { page, limit } = input;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.query.paymentCreditTransactions.findMany({
        where: eq(paymentCreditTransactions.userId, userId),
        limit,
        offset,
        orderBy: [desc(paymentCreditTransactions.createdAt)],
      }),
      this.db
        .select({ count: count() })
        .from(paymentCreditTransactions)
        .where(eq(paymentCreditTransactions.userId, userId)),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * 관리자 수동 조정
   */
  async adjustBalance(userId: string, amount: number, reason: string) {
    return this.addCredits(userId, amount, 'adjustment', reason);
  }

  /**
   * AI 모델 사용량 기반 크레딧 계산
   * - paymentModelPricing 테이블에서 환산비율 조회
   * - 없으면 기본값: 1K 토큰 = 1 크레딧
   */
  async calculateCredits(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<number> {
    const pricing = await this.db.query.paymentModelPricing.findFirst({
      where: eq(paymentModelPricing.modelId, modelId),
    });

    // 기본값: 1K 토큰 = 1 크레딧
    const inputRate = pricing?.inputCreditsPerKToken ?? 1;
    const outputRate = pricing?.outputCreditsPerKToken ?? 1;

    const inputCredits = Math.ceil((promptTokens / 1000) * inputRate);
    const outputCredits = Math.ceil((completionTokens / 1000) * outputRate);

    return inputCredits + outputCredits;
  }
}
