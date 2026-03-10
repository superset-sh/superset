/**
 * Data Tracker Feature - tRPC Router
 *
 * Admin: 트래커 템플릿 CRUD
 * User: 데이터 조회/입력/차트
 * External: 외부 API 데이터 push
 */
import { z } from 'zod';
import {
  router as createTRPCRouter,
  authProcedure,
  adminProcedure,
  getAuthUserId,
  createSingleServiceContainer,
} from '../../core/trpc';
import type { DataTrackerService } from './service/data-tracker.service';

// Service container (injected via NestJS onModuleInit)
const { service: getDataTrackerService, inject: injectDataTrackerService } =
  createSingleServiceContainer<DataTrackerService>();

export { injectDataTrackerService };

// ============================================================================
// Zod Schemas
// ============================================================================

const chartConfigSchema = z.object({
  yAxisKey: z.string().optional(),
  groupByKey: z.string().optional(),
  categoryKey: z.string().optional(),
  valueKey: z.string().optional(),
  aggregation: z.enum(["sum", "avg", "count", "min", "max"]),
});

const columnSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  dataType: z.enum(["text", "number"]),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0),
});

const createTrackerSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  chartType: z.enum(["line", "bar", "pie"]),
  chartConfig: chartConfigSchema,
  scope: z.enum(["personal", "organization", "all"]).optional(),
  columns: z.array(columnSchema).min(1),
});

const updateTrackerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  chartType: z.enum(["line", "bar", "pie"]).optional(),
  chartConfig: chartConfigSchema.optional(),
  scope: z.enum(["personal", "organization", "all"]).optional(),
  columns: z.array(columnSchema).optional(),
});

const entryDataSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const addEntrySchema = z.object({
  trackerId: z.string().uuid(),
  date: z.coerce.date(),
  data: entryDataSchema,
});

const updateEntrySchema = z.object({
  entryId: z.string().uuid(),
  date: z.coerce.date().optional(),
  data: entryDataSchema.optional(),
});

const getEntriesSchema = z.object({
  trackerId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  viewMode: z.enum(["personal", "organization"]).default("organization"),
});

const getChartDataSchema = z.object({
  trackerId: z.string().uuid(),
  days: z.number().int().min(1).max(365).default(30),
  viewMode: z.enum(["personal", "organization"]).default("organization"),
});

const importCsvSchema = z.object({
  trackerId: z.string().uuid(),
  rows: z.array(
    z.object({
      date: z.coerce.date(),
      data: entryDataSchema,
    }),
  ),
});

const pushEntrySchema = z.object({
  trackerSlug: z.string(),
  date: z.coerce.date(),
  data: entryDataSchema,
});

// ============================================================================
// Router
// ============================================================================

export const dataTrackerRouter = createTRPCRouter({
  // --- Admin procedures ---

  adminList: adminProcedure.query(async () => {
    return getDataTrackerService().adminList();
  }),

  adminGetById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return getDataTrackerService().adminGetById(input.id);
    }),

  adminCreate: adminProcedure
    .input(createTrackerSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return getDataTrackerService().adminCreate(input, userId);
    }),

  adminUpdate: adminProcedure
    .input(updateTrackerSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return getDataTrackerService().adminUpdate(id, data);
    }),

  adminDelete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return getDataTrackerService().adminDelete(input.id);
    }),

  adminToggleActive: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return getDataTrackerService().adminToggleActive(input.id);
    }),

  // --- User procedures ---

  list: authProcedure.query(async () => {
    return getDataTrackerService().list();
  }),

  getBySlug: authProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return getDataTrackerService().getBySlug(input.slug);
    }),

  addEntry: authProcedure
    .input(addEntrySchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return getDataTrackerService().addEntry(
        input.trackerId,
        { date: input.date, data: input.data },
        userId,
        "manual",
      );
    }),

  updateEntry: authProcedure
    .input(updateEntrySchema)
    .mutation(async ({ input }) => {
      const { entryId, ...data } = input;
      return getDataTrackerService().updateEntry(entryId, data);
    }),

  deleteEntry: authProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return getDataTrackerService().deleteEntry(input.entryId);
    }),

  getEntries: authProcedure
    .input(getEntriesSchema)
    .query(async ({ input, ctx }) => {
      const userId =
        input.viewMode === "personal" ? getAuthUserId(ctx) : undefined;
      return getDataTrackerService().getEntries(input.trackerId, {
        page: input.page,
        limit: input.limit,
        userId,
      });
    }),

  getChartData: authProcedure
    .input(getChartDataSchema)
    .query(async ({ input, ctx }) => {
      const userId =
        input.viewMode === "personal" ? getAuthUserId(ctx) : undefined;
      return getDataTrackerService().getChartData(input.trackerId, {
        days: input.days,
        userId,
      });
    }),

  importCsv: authProcedure
    .input(importCsvSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      return getDataTrackerService().importCsv(
        input.trackerId,
        input.rows,
        userId,
      );
    }),

  // --- External procedure ---

  pushEntry: authProcedure
    .input(pushEntrySchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const tracker = await getDataTrackerService().getBySlug(input.trackerSlug);
      return getDataTrackerService().addEntry(
        tracker.id,
        { date: input.date, data: input.data },
        userId,
        "api",
      );
    }),
});

export type DataTrackerRouter = typeof dataTrackerRouter;
