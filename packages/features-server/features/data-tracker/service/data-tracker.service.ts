/**
 * Data Tracker Feature - Service
 *
 * 트래커 템플릿 CRUD, 데이터 엔트리 관리, 차트 데이터 조회
 */
import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, desc, asc, count, gte } from 'drizzle-orm';
import {
  dataTrackerTrackers,
  dataTrackerColumns,
  dataTrackerEntries,
  type DataTrackerChartConfig,
} from '@superbuilder/drizzle';
import { createLogger } from '../../../core/logger';

const logger = createLogger('data-tracker');

@Injectable()
export class DataTrackerService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  // ============================================================================
  // Admin: Tracker CRUD
  // ============================================================================

  /** Admin: 전체 트래커 목록 조회 */
  async adminList() {
    return this.db.query.dataTrackerTrackers.findMany({
      where: eq(dataTrackerTrackers.isDeleted, false),
      with: { columns: { orderBy: [asc(dataTrackerColumns.sortOrder)] } },
      orderBy: [desc(dataTrackerTrackers.createdAt)],
    });
  }

  /** Admin: 트래커 단건 조회 */
  async adminGetById(id: string) {
    const tracker = await this.db.query.dataTrackerTrackers.findFirst({
      where: and(
        eq(dataTrackerTrackers.id, id),
        eq(dataTrackerTrackers.isDeleted, false),
      ),
      with: { columns: { orderBy: [asc(dataTrackerColumns.sortOrder)] } },
    });

    if (!tracker) {
      throw new NotFoundException(`Tracker not found: ${id}`);
    }

    return tracker;
  }

  /** Admin: 트래커 생성 */
  async adminCreate(
    input: {
      name: string;
      description?: string;
      chartType: "line" | "bar" | "pie";
      chartConfig: DataTrackerChartConfig;
      scope?: "personal" | "organization" | "all";
      columns: {
        key: string;
        label: string;
        dataType: "text" | "number";
        isRequired?: boolean;
        sortOrder: number;
      }[];
    },
    createdById: string,
  ) {
    const slug = this.generateSlug(input.name);

    const existing = await this.db.query.dataTrackerTrackers.findFirst({
      where: eq(dataTrackerTrackers.slug, slug),
    });

    if (existing) {
      throw new ConflictException(`Slug already exists: ${slug}`);
    }

    const result = await this.db
      .insert(dataTrackerTrackers)
      .values({
        name: input.name,
        description: input.description,
        slug,
        chartType: input.chartType,
        chartConfig: input.chartConfig,
        scope: input.scope ?? "all",
        createdById,
      })
      .returning();

    const tracker = result[0]!;

    if (input.columns.length > 0) {
      await this.db.insert(dataTrackerColumns).values(
        input.columns.map((col) => ({
          trackerId: tracker.id,
          key: col.key,
          label: col.label,
          dataType: col.dataType,
          isRequired: col.isRequired ?? false,
          sortOrder: col.sortOrder,
        })),
      );
    }

    logger.info("Tracker created", {
      "data_tracker.tracker_id": tracker.id,
      "data_tracker.slug": slug,
      "user.id": createdById,
    });

    return this.adminGetById(tracker.id);
  }

  /** Admin: 트래커 수정 */
  async adminUpdate(
    id: string,
    input: {
      name?: string;
      description?: string;
      chartType?: "line" | "bar" | "pie";
      chartConfig?: DataTrackerChartConfig;
      scope?: "personal" | "organization" | "all";
      columns?: {
        key: string;
        label: string;
        dataType: "text" | "number";
        isRequired?: boolean;
        sortOrder: number;
      }[];
    },
  ) {
    const existing = await this.adminGetById(id);

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.chartType !== undefined) updateData.chartType = input.chartType;
    if (input.chartConfig !== undefined) updateData.chartConfig = input.chartConfig;
    if (input.scope !== undefined) updateData.scope = input.scope;

    if (input.name && input.name !== existing.name) {
      const newSlug = this.generateSlug(input.name);
      updateData.slug = newSlug;
    }

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(dataTrackerTrackers)
        .set(updateData)
        .where(eq(dataTrackerTrackers.id, id));
    }

    // 컬럼 교체: 기존 삭제 후 새로 삽입
    if (input.columns !== undefined) {
      await this.db
        .delete(dataTrackerColumns)
        .where(eq(dataTrackerColumns.trackerId, id));

      if (input.columns.length > 0) {
        await this.db.insert(dataTrackerColumns).values(
          input.columns.map((col) => ({
            trackerId: id,
            key: col.key,
            label: col.label,
            dataType: col.dataType,
            isRequired: col.isRequired ?? false,
            sortOrder: col.sortOrder,
          })),
        );
      }
    }

    logger.info("Tracker updated", {
      "data_tracker.tracker_id": id,
      "data_tracker.slug": existing.slug,
    });

    return this.adminGetById(id);
  }

  /** Admin: 트래커 소프트 삭제 */
  async adminDelete(id: string) {
    const tracker = await this.adminGetById(id);

    await this.db
      .update(dataTrackerTrackers)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(dataTrackerTrackers.id, id));

    logger.info("Tracker deleted", {
      "data_tracker.tracker_id": id,
      "data_tracker.slug": tracker.slug,
    });

    return { success: true };
  }

  /** Admin: 트래커 활성/비활성 토글 */
  async adminToggleActive(id: string) {
    const tracker = await this.adminGetById(id);

    await this.db
      .update(dataTrackerTrackers)
      .set({ isActive: !tracker.isActive })
      .where(eq(dataTrackerTrackers.id, id));

    logger.info("Tracker toggled", {
      "data_tracker.tracker_id": id,
      "data_tracker.is_active": !tracker.isActive,
    });

    return this.adminGetById(id);
  }

  // ============================================================================
  // User: Tracker 조회
  // ============================================================================

  /** User: 활성 트래커 목록 */
  async list() {
    return this.db.query.dataTrackerTrackers.findMany({
      where: and(
        eq(dataTrackerTrackers.isActive, true),
        eq(dataTrackerTrackers.isDeleted, false),
      ),
      with: { columns: { orderBy: [asc(dataTrackerColumns.sortOrder)] } },
      orderBy: [desc(dataTrackerTrackers.createdAt)],
    });
  }

  /** User: slug로 트래커 조회 */
  async getBySlug(slug: string) {
    const tracker = await this.db.query.dataTrackerTrackers.findFirst({
      where: and(
        eq(dataTrackerTrackers.slug, slug),
        eq(dataTrackerTrackers.isActive, true),
        eq(dataTrackerTrackers.isDeleted, false),
      ),
      with: { columns: { orderBy: [asc(dataTrackerColumns.sortOrder)] } },
    });

    if (!tracker) {
      throw new NotFoundException(`Tracker not found: ${slug}`);
    }

    return tracker;
  }

  // ============================================================================
  // User: Entry CRUD
  // ============================================================================

  /** 엔트리 추가 */
  async addEntry(
    trackerId: string,
    input: { date: Date; data: Record<string, string | number> },
    createdById: string,
    source: "manual" | "csv_import" | "api" = "manual",
  ) {
    const tracker = await this.adminGetById(trackerId);

    if (!tracker.isActive) {
      throw new ForbiddenException("Tracker is not active");
    }

    const entryResult = await this.db
      .insert(dataTrackerEntries)
      .values({
        trackerId,
        date: input.date,
        data: input.data,
        source,
        createdById,
      })
      .returning();

    const entry = entryResult[0]!;

    logger.info("Entry added", {
      "data_tracker.tracker_id": trackerId,
      "data_tracker.entry_id": entry.id,
      "data_tracker.source": source,
      "user.id": createdById,
    });

    return entry;
  }

  /** 엔트리 수정 */
  async updateEntry(
    entryId: string,
    input: { date?: Date; data?: Record<string, string | number> },
  ) {
    const existing = await this.db.query.dataTrackerEntries.findFirst({
      where: and(
        eq(dataTrackerEntries.id, entryId),
        eq(dataTrackerEntries.isDeleted, false),
      ),
    });

    if (!existing) {
      throw new NotFoundException(`Entry not found: ${entryId}`);
    }

    const updateData: Record<string, unknown> = {};
    if (input.date !== undefined) updateData.date = input.date;
    if (input.data !== undefined) updateData.data = input.data;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(dataTrackerEntries)
        .set(updateData)
        .where(eq(dataTrackerEntries.id, entryId));
    }

    logger.info("Entry updated", {
      "data_tracker.tracker_id": existing.trackerId,
      "data_tracker.entry_id": entryId,
    });

    const updated = await this.db.query.dataTrackerEntries.findFirst({
      where: eq(dataTrackerEntries.id, entryId),
    });

    return updated!;
  }

  /** 엔트리 소프트 삭제 */
  async deleteEntry(entryId: string) {
    const existing = await this.db.query.dataTrackerEntries.findFirst({
      where: and(
        eq(dataTrackerEntries.id, entryId),
        eq(dataTrackerEntries.isDeleted, false),
      ),
    });

    if (!existing) {
      throw new NotFoundException(`Entry not found: ${entryId}`);
    }

    await this.db
      .update(dataTrackerEntries)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(dataTrackerEntries.id, entryId));

    logger.info("Entry deleted", {
      "data_tracker.tracker_id": existing.trackerId,
      "data_tracker.entry_id": entryId,
    });

    return { success: true };
  }

  /** 페이지네이션 엔트리 조회 */
  async getEntries(
    trackerId: string,
    input: { page: number; limit: number; userId?: string },
  ) {
    const { page, limit, userId } = input;
    const offset = (page - 1) * limit;

    const whereConditions = [
      eq(dataTrackerEntries.trackerId, trackerId),
      eq(dataTrackerEntries.isDeleted, false),
    ];

    if (userId) {
      whereConditions.push(eq(dataTrackerEntries.createdById, userId));
    }

    const whereClause = and(...whereConditions);

    const [data, totalResult] = await Promise.all([
      this.db.query.dataTrackerEntries.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [desc(dataTrackerEntries.date)],
        with: { createdBy: true },
      }),
      this.db
        .select({ count: count() })
        .from(dataTrackerEntries)
        .where(whereClause),
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

  /** 차트 데이터 조회 */
  async getChartData(
    trackerId: string,
    input: { days: number; userId?: string },
  ) {
    const { days, userId } = input;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const whereConditions = [
      eq(dataTrackerEntries.trackerId, trackerId),
      eq(dataTrackerEntries.isDeleted, false),
      gte(dataTrackerEntries.date, startDate),
    ];

    if (userId) {
      whereConditions.push(eq(dataTrackerEntries.createdById, userId));
    }

    return this.db.query.dataTrackerEntries.findMany({
      where: and(...whereConditions),
      orderBy: [asc(dataTrackerEntries.date)],
      with: { createdBy: true },
    });
  }

  /** CSV 일괄 가져오기 */
  async importCsv(
    trackerId: string,
    rows: { date: Date; data: Record<string, string | number> }[],
    createdById: string,
  ) {
    const tracker = await this.adminGetById(trackerId);

    if (!tracker.isActive) {
      throw new ForbiddenException("Tracker is not active");
    }

    if (rows.length === 0) {
      return { imported: 0 };
    }

    const values = rows.map((row) => ({
      trackerId,
      date: row.date,
      data: row.data,
      source: "csv_import" as const,
      createdById,
    }));

    await this.db.insert(dataTrackerEntries).values(values);

    logger.info("CSV imported", {
      "data_tracker.tracker_id": trackerId,
      "data_tracker.rows_imported": rows.length,
      "user.id": createdById,
    });

    return { imported: rows.length };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/(^-|-$)/g, "");

    return `${baseSlug}-${Date.now().toString(36)}`;
  }
}
