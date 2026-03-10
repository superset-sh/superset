import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, lte, sql } from 'drizzle-orm';
import {
  paymentCreditBalances,
  paymentCreditTransactions,
  paymentPlans,
} from '@superbuilder/drizzle';
import { ScheduledJobService } from './scheduled-job.service';

@Injectable()
export class CronRunnerService {
  private readonly logger = new Logger(CronRunnerService.name);

  // 외부 서비스 주입용 (OnModuleInit에서 설정)
  private marketingScheduler: {
    processScheduledPublications: () => Promise<void>;
    retryFailedPublications: () => Promise<void>;
  } | null = null;

  private analyticsService: {
    aggregateDaily: () => Promise<Record<string, unknown>>;
  } | null = null;

  private studioAiSuggest: {
    processDueRecurrences: () => Promise<Record<string, unknown>>;
  } | null = null;

  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly jobService: ScheduledJobService,
  ) {}

  setMarketingScheduler(scheduler: {
    processScheduledPublications: () => Promise<void>;
    retryFailedPublications: () => Promise<void>;
  }) {
    this.marketingScheduler = scheduler;
  }

  setAnalyticsService(service: {
    aggregateDaily: () => Promise<Record<string, unknown>>;
  }) {
    this.analyticsService = service;
  }

  setStudioAiSuggest(service: {
    processDueRecurrences: () => Promise<Record<string, unknown>>;
  }) {
    this.studioAiSuggest = service;
  }

  /**
   * 크레딧 월 갱신 -- 매일 자정
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async creditMonthlyRenewal() {
    await this.runJob('credit_monthly_renewal', async () => {
      const now = new Date();
      let processedCount = 0;

      // currentPeriodEnd가 지난 사용자 조회
      const expiredBalances = await this.db
        .select()
        .from(paymentCreditBalances)
        .where(lte(paymentCreditBalances.currentPeriodEnd, now));

      for (const balance of expiredBalances) {
        if (!balance.planId) continue;

        // 플랜 조회
        const plan = await this.db.query.paymentPlans.findFirst({
          where: eq(paymentPlans.id, balance.planId),
        });

        if (!plan) continue;

        const balanceBefore = balance.balance;
        const newBalance = plan.monthlyCredits;

        // 잔액 리셋
        const periodStart = now;
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await this.db
          .update(paymentCreditBalances)
          .set({
            balance: newBalance,
            monthlyAllocation: plan.monthlyCredits,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            lastRechargedAt: now,
          })
          .where(eq(paymentCreditBalances.userId, balance.userId));

        // 트랜잭션 로그
        await this.db
          .insert(paymentCreditTransactions)
          .values({
            userId: balance.userId,
            type: 'allocation',
            amount: newBalance,
            balanceBefore,
            balanceAfter: newBalance,
            description: `월간 크레딧 갱신: ${plan.name}`,
          });

        processedCount++;
      }

      return { processedCount };
    });
  }

  /**
   * 마케팅 예약 발행 -- 매분
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async marketingScheduledPublish() {
    if (!this.marketingScheduler) return;

    await this.runJob('marketing_scheduled_publish', async () => {
      await this.marketingScheduler!.processScheduledPublications();
      await this.marketingScheduler!.retryFailedPublications();
      return { status: 'processed' };
    });
  }

  /**
   * 데이터 정리 -- 매일 03:00
   * 90일 이상 소프트 삭제된 데이터를 물리 삭제합니다.
   */
  @Cron('0 3 * * *')
  async dataCleanup() {
    await this.runJob('data_cleanup', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const tables = [
        'board_posts',
        'comment_comments',
        'community_posts',
        'community_comments',
        'agent_agents',
        'agent_threads',
      ];

      let totalDeleted = 0;

      for (const table of tables) {
        try {
          const result = await this.db.execute(
            sql`DELETE FROM ${sql.identifier(table)} WHERE is_deleted = true AND deleted_at < ${cutoffDate}`,
          );
          totalDeleted += (result as unknown as { rowCount?: number }).rowCount ?? 0;
        } catch {
          // 테이블이 없거나 is_deleted 컬럼이 없으면 무시
        }
      }

      return { totalDeleted, cutoffDate: cutoffDate.toISOString() };
    });
  }

  /**
   * 분석 일별 집계 -- 매일 01:00
   * 전일 이벤트 데이터를 일별 메트릭으로 집계합니다.
   */
  @Cron('0 1 * * *')
  async analyticsDailyAggregate() {
    if (!this.analyticsService) return;

    await this.runJob('analytics_daily_aggregate', async () => {
      return this.analyticsService!.aggregateDaily();
    });
  }

  /**
   * Studio AI 추천 실행 -- 매시간
   * nextRunAt이 지난 active AI recurrence를 찾아 실행
   */
  @Cron(CronExpression.EVERY_HOUR)
  async studioAiSuggestProcess() {
    if (!this.studioAiSuggest) return;

    await this.runJob('studio_ai_suggest', async () => {
      return this.studioAiSuggest!.processDueRecurrences();
    });
  }

  // ==========================================================================
  // Helper: 잡 실행 래퍼
  // ==========================================================================

  private async runJob(
    jobKey: string,
    fn: () => Promise<Record<string, unknown>>,
  ) {
    const isActive = await this.jobService.isJobActive(jobKey);
    if (!isActive) return;

    const run = await this.jobService.recordRunStart(jobKey);
    if (!run) return;

    try {
      const result = await fn();
      await this.jobService.recordRunComplete(run.id, 'success', result);
      this.logger.log(`[${jobKey}] 완료: ${JSON.stringify(result)}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '알 수 없는 오류';
      await this.jobService.recordRunComplete(
        run.id,
        'failed',
        undefined,
        message,
      );
      this.logger.error(`[${jobKey}] 실패: ${message}`);
    }
  }
}
