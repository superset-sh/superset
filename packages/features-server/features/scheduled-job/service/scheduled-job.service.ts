import { Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginatedResult } from '../../../shared/utils/offset-pagination';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, desc, count } from 'drizzle-orm';
import {
  systemScheduledJobs,
  systemJobRuns,
} from '@superbuilder/drizzle';

@Injectable()
export class ScheduledJobService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /** 잡 목록 조회 */
  async listJobs() {
    return this.db.query.systemScheduledJobs.findMany({
      orderBy: [desc(systemScheduledJobs.createdAt)],
    });
  }

  /** 잡 실행 이력 조회 (페이지네이션) */
  async getJobRuns(jobId: string, input: { page: number; limit: number }) {
    const { page, limit } = input;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.query.systemJobRuns.findMany({
        where: eq(systemJobRuns.jobId, jobId),
        limit,
        offset,
        orderBy: [desc(systemJobRuns.startedAt)],
      }),
      this.db
        .select({ count: count() })
        .from(systemJobRuns)
        .where(eq(systemJobRuns.jobId, jobId)),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  /** 잡 활성/비활성 토글 */
  async toggleJob(jobId: string) {
    const job = await this.db.query.systemScheduledJobs.findFirst({
      where: eq(systemScheduledJobs.id, jobId),
    });

    if (!job) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }

    const [updated] = await this.db
      .update(systemScheduledJobs)
      .set({ isActive: !job.isActive })
      .where(eq(systemScheduledJobs.id, jobId))
      .returning();

    return updated!;
  }

  /** 실행 시작 기록 */
  async recordRunStart(jobKey: string) {
    const job = await this.db.query.systemScheduledJobs.findFirst({
      where: eq(systemScheduledJobs.jobKey, jobKey),
    });

    if (!job) return null;

    const now = new Date();

    const [run] = await this.db
      .insert(systemJobRuns)
      .values({
        jobId: job.id,
        status: 'running',
        startedAt: now,
      })
      .returning();

    await this.db
      .update(systemScheduledJobs)
      .set({ lastRunAt: now })
      .where(eq(systemScheduledJobs.id, job.id));

    return run;
  }

  /** 실행 완료 기록 */
  async recordRunComplete(
    runId: string,
    status: 'success' | 'failed',
    result?: Record<string, unknown>,
    errorMessage?: string,
  ) {
    const now = new Date();
    const run = await this.db.query.systemJobRuns.findFirst({
      where: eq(systemJobRuns.id, runId),
    });

    const durationMs = run ? now.getTime() - run.startedAt.getTime() : 0;

    const [updated] = await this.db
      .update(systemJobRuns)
      .set({
        status,
        completedAt: now,
        durationMs,
        result: result ?? null,
        errorMessage: errorMessage ?? null,
      })
      .where(eq(systemJobRuns.id, runId))
      .returning();

    return updated;
  }

  /** 잡 키로 활성 여부 확인 */
  async isJobActive(jobKey: string): Promise<boolean> {
    const job = await this.db.query.systemScheduledJobs.findFirst({
      where: eq(systemScheduledJobs.jobKey, jobKey),
    });
    return job?.isActive ?? false;
  }

  /** 초기 잡 시드 (upsert) */
  async seedJob(input: {
    jobKey: string;
    displayName: string;
    description?: string;
    cronExpression: string;
  }) {
    const [result] = await this.db
      .insert(systemScheduledJobs)
      .values(input)
      .onConflictDoUpdate({
        target: systemScheduledJobs.jobKey,
        set: {
          displayName: input.displayName,
          description: input.description,
          cronExpression: input.cronExpression,
        },
      })
      .returning();

    return result;
  }
}
