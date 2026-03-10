import { Injectable } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, desc, asc, count, gte, lte, lt } from 'drizzle-orm';
import {
  profiles,
  systemAnalyticsEvents,
  systemDailyMetrics,
} from '@superbuilder/drizzle';

@Injectable()
export class AnalyticsService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /** 이벤트 기록 */
  async track(input: {
    eventType: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    eventData?: Record<string, unknown>;
  }) {
    const [event] = await this.db
      .insert(systemAnalyticsEvents)
      .values(input)
      .returning();

    return event;
  }

  /** KPI 카드 4개 — 총 사용자, DAU, MAU, 신규 가입 */
  async getOverview() {
    // 총 사용자
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(profiles);
    const totalUsers = totalResult?.count ?? 0;

    // 최근 일별 메트릭 조회 (오늘 + 어제)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const latestMetrics = await this.db.query.systemDailyMetrics.findMany({
      where: and(
        gte(systemDailyMetrics.date, yesterday),
        lte(systemDailyMetrics.date, today),
      ),
      orderBy: [desc(systemDailyMetrics.date)],
    });

    const getMetricValue = (key: string) => {
      const metric = latestMetrics.find((m) => m.metricKey === key);
      return metric?.value ?? 0;
    };

    return {
      totalUsers,
      dau: getMetricValue('dau'),
      mau: getMetricValue('mau'),
      newSignups: getMetricValue('sign_ups'),
    };
  }

  /** 기간별 트렌드 조회 */
  async getTrend(input: { metricKey: string; days: number }) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - input.days);

    return this.db.query.systemDailyMetrics.findMany({
      where: and(
        eq(systemDailyMetrics.metricKey, input.metricKey),
        gte(systemDailyMetrics.date, startDate),
      ),
      orderBy: [asc(systemDailyMetrics.date)],
    });
  }

  /** 이벤트 타입별 분포 (최근 30일) */
  async getDistribution() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const distribution = await this.db
      .select({
        eventType: systemAnalyticsEvents.eventType,
        count: count(),
      })
      .from(systemAnalyticsEvents)
      .where(gte(systemAnalyticsEvents.createdAt, startDate))
      .groupBy(systemAnalyticsEvents.eventType);

    return distribution;
  }

  /** 일별 집계 — CronRunner에서 호출 */
  async aggregateDaily() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfDay = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // 이벤트 타입별 카운트
    const eventCounts = await this.db
      .select({
        eventType: systemAnalyticsEvents.eventType,
        count: count(),
      })
      .from(systemAnalyticsEvents)
      .where(
        and(
          gte(systemAnalyticsEvents.createdAt, startOfDay),
          lt(systemAnalyticsEvents.createdAt, endOfDay),
        ),
      )
      .groupBy(systemAnalyticsEvents.eventType);

    // DAU (전일 sign_in distinct userId)
    const dauResult = await this.db
      .selectDistinct({ userId: systemAnalyticsEvents.userId })
      .from(systemAnalyticsEvents)
      .where(
        and(
          eq(systemAnalyticsEvents.eventType, 'sign_in'),
          gte(systemAnalyticsEvents.createdAt, startOfDay),
          lt(systemAnalyticsEvents.createdAt, endOfDay),
        ),
      );

    // MAU (최근 30일 sign_in distinct userId)
    const thirtyDaysAgo = new Date(startOfDay);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const mauResult = await this.db
      .selectDistinct({ userId: systemAnalyticsEvents.userId })
      .from(systemAnalyticsEvents)
      .where(
        and(
          eq(systemAnalyticsEvents.eventType, 'sign_in'),
          gte(systemAnalyticsEvents.createdAt, thirtyDaysAgo),
          lt(systemAnalyticsEvents.createdAt, endOfDay),
        ),
      );

    // Upsert metrics
    const metrics = [
      { metricKey: 'dau', value: dauResult.length },
      { metricKey: 'mau', value: mauResult.length },
      ...eventCounts.map((ec) => ({ metricKey: ec.eventType, value: ec.count })),
    ];

    for (const m of metrics) {
      await this.db
        .insert(systemDailyMetrics)
        .values({ date: startOfDay, metricKey: m.metricKey, value: m.value })
        .onConflictDoUpdate({
          target: [systemDailyMetrics.date, systemDailyMetrics.metricKey],
          set: { value: m.value },
        });
    }

    return { date: startOfDay.toISOString(), metricsCount: metrics.length };
  }
}
