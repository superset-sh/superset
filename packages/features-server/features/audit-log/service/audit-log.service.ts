import { Injectable } from '@nestjs/common';
import { buildPaginatedResult } from '../../../shared/utils/offset-pagination';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, desc, count, gte, lte, type SQL } from 'drizzle-orm';
import { systemAuditLogs } from '@superbuilder/drizzle';
import type { NewSystemAuditLog } from '@superbuilder/drizzle';

@Injectable()
export class AuditLogService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /** 감사 로그 기록 */
  async log(input: Omit<NewSystemAuditLog, 'id' | 'createdAt' | 'updatedAt'>) {
    const [log] = await this.db
      .insert(systemAuditLogs)
      .values(input)
      .returning();

    return log;
  }

  /** 로그 목록 조회 (필터 + 페이지네이션) */
  async listLogs(input: {
    page: number;
    limit: number;
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { page, limit, userId, action, resourceType, startDate, endDate } = input;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (userId) conditions.push(eq(systemAuditLogs.userId, userId));
    if (action) conditions.push(eq(systemAuditLogs.action, action as typeof systemAuditLogs.action.enumValues[number]));
    if (resourceType) conditions.push(eq(systemAuditLogs.resourceType, resourceType));
    if (startDate) conditions.push(gte(systemAuditLogs.createdAt, startDate));
    if (endDate) conditions.push(lte(systemAuditLogs.createdAt, endDate));

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db.query.systemAuditLogs.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: [desc(systemAuditLogs.createdAt)],
      }),
      this.db
        .select({ count: count() })
        .from(systemAuditLogs)
        .where(whereCondition),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return buildPaginatedResult(data, total, page, limit);
  }

  /** 로그 상세 조회 */
  async getLog(id: string) {
    return this.db.query.systemAuditLogs.findFirst({
      where: eq(systemAuditLogs.id, id),
    });
  }
}
