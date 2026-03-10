import { Injectable, Inject, BadRequestException, BadGatewayException } from "@nestjs/common";
import { eq, and, lte, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  DRIZZLE,
  marketingPublications,
  marketingPlatformVariants,
  marketingSnsAccounts,
} from "@superbuilder/drizzle";
import { SnsPublisherService } from "./sns-publisher.service";

@Injectable()
export class SchedulerService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
    private readonly publisherService: SnsPublisherService,
  ) {}

  /**
   * 예약된 발행 처리
   * scheduled_at이 현재 시간 이전인 건을 조회하여 발행합니다.
   *
   * 실제 구현 시 @Cron('* * * * *') 데코레이터 추가
   */
  async processScheduledPublications(): Promise<void> {
    const now = new Date();

    // scheduled 상태이고 예약 시간이 도달한 건 조회
    const pendingPublications = await this.db
      .select()
      .from(marketingPublications)
      .where(
        and(
          eq(marketingPublications.status, "scheduled"),
          lte(marketingPublications.scheduledAt, now),
        ),
      );

    for (const publication of pendingPublications) {
      await this.processPublication(publication.id);
    }
  }

  /**
   * 실패한 발행 재시도
   * retry_count < 3인 실패 건을 exponential backoff로 재시도합니다.
   * 재시도 간격: 1분, 5분, 30분
   *
   * 실제 구현 시 @Cron 데코레이터 추가 (5분 간격)
   */
  async retryFailedPublications(): Promise<void> {
    const now = new Date();

    // 실패 상태이고 retry_count < 3인 건 조회
    const failedPublications = await this.db
      .select()
      .from(marketingPublications)
      .where(
        and(
          eq(marketingPublications.status, "failed"),
          lt(marketingPublications.retryCount, 3),
        ),
      );

    for (const publication of failedPublications) {
      // Exponential backoff: 1분, 5분, 30분
      const backoffMinutes = [1, 5, 30];
      const waitMinutes = backoffMinutes[publication.retryCount] ?? 30;
      const retryAfter = new Date(
        publication.updatedAt!.getTime() + waitMinutes * 60 * 1000,
      );

      if (now < retryAfter) {
        continue; // 아직 대기 시간이 지나지 않음
      }

      await this.processPublication(publication.id);
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * 개별 발행 처리
   */
  private async processPublication(publicationId: string): Promise<void> {
    // 상태를 publishing으로 변경
    await this.db
      .update(marketingPublications)
      .set({ status: "publishing" })
      .where(eq(marketingPublications.id, publicationId));

    try {
      const [publication] = await this.db
        .select()
        .from(marketingPublications)
        .where(eq(marketingPublications.id, publicationId))
        .limit(1);

      if (!publication) return;

      // variant 조회 (있는 경우)
      let variant: typeof marketingPlatformVariants.$inferSelect | null = null;
      if (publication.variantId) {
        const [v] = await this.db
          .select()
          .from(marketingPlatformVariants)
          .where(eq(marketingPlatformVariants.id, publication.variantId))
          .limit(1);
        variant = v ?? null;
      }

      // SNS 계정 조회
      const [account] = await this.db
        .select()
        .from(marketingSnsAccounts)
        .where(eq(marketingSnsAccounts.id, publication.snsAccountId))
        .limit(1);

      if (!account || !account.isActive) {
        throw new BadRequestException("유효하지 않거나 비활성화된 계정입니다");
      }

      if (!variant) {
        throw new BadRequestException("발행할 콘텐츠 변형이 없습니다");
      }

      // 발행 실행
      const result = await this.publisherService.publish(
        publication.platform,
        variant,
        account,
      );

      if (result.success) {
        await this.db
          .update(marketingPublications)
          .set({
            status: "published",
            publishedAt: new Date(),
            platformPostId: result.platformPostId,
            platformPostUrl: result.platformPostUrl,
          })
          .where(eq(marketingPublications.id, publicationId));
      } else {
        throw new BadGatewayException(result.errorMessage ?? "발행 실패");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류";

      // retryCount 증가 및 실패 상태 업데이트
      const [publication] = await this.db
        .select()
        .from(marketingPublications)
        .where(eq(marketingPublications.id, publicationId))
        .limit(1);

      const newRetryCount = (publication?.retryCount ?? 0) + 1;

      await this.db
        .update(marketingPublications)
        .set({
          status: "failed",
          errorMessage,
          retryCount: newRetryCount,
        })
        .where(eq(marketingPublications.id, publicationId));
    }
  }
}
