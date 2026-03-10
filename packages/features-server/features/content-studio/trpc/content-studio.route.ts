/**
 * Content Studio tRPC Router
 */
import {
  adminProcedure,
  authProcedure,
  createSingleServiceContainer,
  router,
} from "../../../core/trpc";
import { z } from "zod";
import type { ContentStudioService } from "../service/content-studio.service";
import type { StudioAiSuggestService } from "../service/studio-ai-suggest.service";
import type { StudioBrandVoiceService } from "../service/studio-brand-voice.service";
import type { StudioRepurposeService } from "../service/studio-repurpose.service";
import type { StudioSeoService } from "../service/studio-seo.service";

// ============================================================================
// Service Container
// ============================================================================

const services = createSingleServiceContainer<ContentStudioService>();
export const injectContentStudioService = services.inject;

// AI Suggest Service Container
const aiServices = createSingleServiceContainer<StudioAiSuggestService>();
export const injectStudioAiSuggestService = aiServices.inject;

// Brand Voice Service Container
const brandVoiceServices = createSingleServiceContainer<StudioBrandVoiceService>();
export const injectStudioBrandVoiceService = brandVoiceServices.inject;

// SEO Service Container
const seoServices = createSingleServiceContainer<StudioSeoService>();
export const injectStudioSeoService = seoServices.inject;

// Repurpose Service Container
const repurposeServices = createSingleServiceContainer<StudioRepurposeService>();
export const injectStudioRepurposeService = repurposeServices.inject;

// ============================================================================
// Zod Schemas
// ============================================================================

const createStudioSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

const updateStudioSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  visibility: z.enum(["public", "private"]).optional(),
});

const createTopicSchema = z.object({
  studioId: z.string().uuid(),
  label: z.string().min(1).max(100),
  color: z.string().max(20).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

const updateTopicSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  color: z.string().max(20).optional().nullable(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

const createContentSchema = z.object({
  studioId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  content: z.string().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

const updateContentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  thumbnailUrl: z.string().optional().nullable(),
  status: z.enum(["draft", "writing", "review", "published", "canceled"]).optional(),
  topicId: z.string().uuid().nullable().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  label: z.string().max(50).nullable().optional(),
  slug: z.string().max(300).nullable().optional(),
});

const createEdgeSchema = z.object({
  studioId: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceType: z.enum(["topic", "content"]),
  targetId: z.string().uuid(),
  targetType: z.enum(["topic", "content"]),
});

const nodePositionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["topic", "content"]),
  positionX: z.number(),
  positionY: z.number(),
});

const addSeoSchema = z.object({
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  seoKeywords: z.array(z.string()).optional(),
  ogImageUrl: z.string().optional(),
  pageViews: z.number().optional(),
  uniqueVisitors: z.number().optional(),
  avgTimeOnPage: z.number().optional(),
  bounceRate: z.number().optional(),
});

// Calendar
const calendarListSchema = z.object({
  studioId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

const scheduleContentSchema = z.object({
  contentId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});

// Recurrence
const createRecurrenceSchema = z.object({
  studioId: z.string().uuid(),
  title: z.string().min(1).max(200),
  rule: z.string().min(1).max(50),
  templateContentId: z.string().uuid().optional(),
  label: z.string().max(50).optional(),
  nextRunAt: z.string().datetime().optional(),
});

const updateRecurrenceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  rule: z.string().min(1).max(50).optional(),
  templateContentId: z.string().uuid().nullable().optional(),
  label: z.string().max(50).nullable().optional(),
  nextRunAt: z.string().datetime().nullable().optional(),
});

// AI Suggest
const aiSuggestSchema = z.object({
  studioId: z.string().uuid(),
  topicId: z.string().uuid(),
  prompt: z.string().max(500).optional(),
});

const aiGenerateSchema = z.object({
  studioId: z.string().uuid(),
  topicId: z.string().uuid(),
  suggestion: z.object({
    title: z.string(),
    description: z.string(),
    nodeType: z.string(),
    relevance: z.string(),
  }),
});

// AI Recurrence
const createAiRecurrenceSchema = z.object({
  studioId: z.string().uuid(),
  topicId: z.string().uuid(),
  prompt: z.string().max(500).optional(),
  rule: z.enum(["weekly", "biweekly", "monthly"]),
  nextRunAt: z.string().datetime().optional(),
});

const updateAiRecurrenceSchema = z.object({
  prompt: z.string().max(500).nullable().optional(),
  rule: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  nextRunAt: z.string().datetime().nullable().optional(),
});

// Brand Voice
const upsertBrandProfileSchema = z.object({
  studioId: z.string().uuid(),
  brandName: z.string().min(1).max(100),
  industry: z.string().max(100).optional().nullable(),
  targetAudience: z.string().max(500).optional().nullable(),
  formality: z.number().int().min(1).max(5).default(3),
  friendliness: z.number().int().min(1).max(5).default(3),
  humor: z.number().int().min(1).max(5).default(2),
  sentenceLength: z.enum(["short", "medium", "long"]).default("medium"),
  forbiddenWords: z.array(z.string().max(50)).max(50).default([]),
  requiredWords: z.array(z.string().max(50)).max(50).default([]),
  additionalGuidelines: z.string().max(2000).optional().nullable(),
});

const createTonePresetSchema = z.object({
  studioId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  formality: z.number().int().min(1).max(5),
  friendliness: z.number().int().min(1).max(5),
  humor: z.number().int().min(1).max(5),
  sentenceLength: z.enum(["short", "medium", "long"]),
  systemPromptSuffix: z.string().max(1000).optional(),
});

const updateTonePresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  formality: z.number().int().min(1).max(5).optional(),
  friendliness: z.number().int().min(1).max(5).optional(),
  humor: z.number().int().min(1).max(5).optional(),
  sentenceLength: z.enum(["short", "medium", "long"]).optional(),
  systemPromptSuffix: z.string().max(1000).optional().nullable(),
});

const suggestAlternativesSchema = z.object({
  studioId: z.string().uuid(),
  word: z.string().min(1).max(50),
  context: z.string().max(500),
});

// Repurpose
const convertSchema = z.object({
  contentId: z.string().uuid(),
  format: z.enum(["card_news", "short_form", "twitter_thread", "email_summary"]),
  customInstruction: z.string().max(500).optional(),
});

const convertBatchSchema = z.object({
  contentId: z.string().uuid(),
  formats: z
    .array(z.enum(["card_news", "short_form", "twitter_thread", "email_summary"]))
    .min(1)
    .max(4),
  customInstruction: z.string().max(500).optional(),
});

// ============================================================================
// Router
// ============================================================================

export const contentStudioRouter = router({
  // Studio
  studios: authProcedure.query(async ({ ctx }) => {
    return services.service().findStudios(ctx.user!.id);
  }),

  canvas: authProcedure
    .input(z.object({ studioId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return services.service().getCanvasData(input.studioId, ctx.user!.id);
    }),

  createStudio: authProcedure.input(createStudioSchema).mutation(async ({ input, ctx }) => {
    return services.service().createStudio(input, ctx.user!.id);
  }),

  updateStudio: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateStudioSchema }))
    .mutation(async ({ input, ctx }) => {
      return services.service().updateStudio(input.id, input.data, ctx.user!.id);
    }),

  deleteStudio: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().deleteStudio(input.id, ctx.user!.id);
    }),

  // Topic
  createTopic: authProcedure.input(createTopicSchema).mutation(async ({ input, ctx }) => {
    return services.service().createTopic(input, ctx.user!.id);
  }),

  updateTopic: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateTopicSchema }))
    .mutation(async ({ input, ctx }) => {
      return services.service().updateTopic(input.id, input.data, ctx.user!.id);
    }),

  deleteTopic: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().deleteTopic(input.id, ctx.user!.id);
    }),

  // Content
  getContent: authProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return services.service().getContent(input.id);
  }),

  createContent: authProcedure.input(createContentSchema).mutation(async ({ input, ctx }) => {
    return services.service().createContent(input, ctx.user!.id);
  }),

  updateContent: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateContentSchema }))
    .mutation(async ({ input, ctx }) => {
      const data = {
        ...input.data,
        scheduledAt:
          input.data.scheduledAt === null
            ? null
            : input.data.scheduledAt
              ? new Date(input.data.scheduledAt)
              : undefined,
      };
      return services.service().updateContent(input.id, data, ctx.user!.id);
    }),

  deleteContent: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().deleteContent(input.id, ctx.user!.id);
    }),

  updateNodePositions: authProcedure
    .input(z.object({ updates: z.array(nodePositionSchema) }))
    .mutation(async ({ input, ctx }) => {
      return services.service().updateNodePositions(input.updates, ctx.user!.id);
    }),

  // Edge
  createEdge: authProcedure.input(createEdgeSchema).mutation(async ({ input, ctx }) => {
    return services.service().createEdge(input, ctx.user!.id);
  }),

  deleteEdge: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().deleteEdge(input.id, ctx.user!.id);
    }),

  // SEO
  seoHistory: authProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .query(async ({ input }) => {
      return services.service().getSeoHistory(input.contentId);
    }),

  addSeoSnapshot: authProcedure
    .input(z.object({ contentId: z.string().uuid(), data: addSeoSchema }))
    .mutation(async ({ input, ctx }) => {
      return services.service().addSeoSnapshot(input.contentId, input.data, ctx.user!.id);
    }),

  // Calendar
  calendarList: authProcedure.input(calendarListSchema).query(async ({ input, ctx }) => {
    return services
      .service()
      .getCalendarContents(input.studioId, input.year, input.month, ctx.user!.id);
  }),

  scheduleContent: authProcedure.input(scheduleContentSchema).mutation(async ({ input, ctx }) => {
    return services
      .service()
      .scheduleContent(input.contentId, new Date(input.scheduledAt), ctx.user!.id);
  }),

  unscheduleContent: authProcedure
    .input(z.object({ contentId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().unscheduleContent(input.contentId, ctx.user!.id);
    }),

  // Recurrence
  recurrenceList: authProcedure
    .input(z.object({ studioId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return services.service().findRecurrences(input.studioId, ctx.user!.id);
    }),

  createRecurrence: authProcedure.input(createRecurrenceSchema).mutation(async ({ input, ctx }) => {
    const data = {
      ...input,
      nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
    };
    return services.service().createRecurrence(data, ctx.user!.id);
  }),

  updateRecurrence: authProcedure
    .input(z.object({ id: z.string().uuid(), data: updateRecurrenceSchema }))
    .mutation(async ({ input, ctx }) => {
      const data = {
        ...input.data,
        nextRunAt:
          input.data.nextRunAt === null
            ? null
            : input.data.nextRunAt
              ? new Date(input.data.nextRunAt)
              : undefined,
      };
      return services.service().updateRecurrence(input.id, data, ctx.user!.id);
    }),

  deleteRecurrence: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().deleteRecurrence(input.id, ctx.user!.id);
    }),

  toggleRecurrence: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().toggleRecurrence(input.id, ctx.user!.id);
    }),

  executeRecurrence: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return services.service().executeRecurrence(input.id, ctx.user!.id);
    }),

  // Admin
  adminList: adminProcedure.query(async () => {
    return services.service().adminFindAll();
  }),

  // AI Suggest
  ai: router({
    chat: authProcedure
      .input(
        z.object({
          studioId: z.string().uuid(),
          contentId: z.string().uuid(),
          prompt: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return aiServices.service().chat(input, ctx.user!.id);
      }),

    suggest: authProcedure.input(aiSuggestSchema).mutation(async ({ input, ctx }) => {
      return aiServices.service().suggest(input, ctx.user!.id);
    }),

    generate: authProcedure.input(aiGenerateSchema).mutation(async ({ input, ctx }) => {
      return aiServices.service().generate(input, ctx.user!.id);
    }),

    suggestAndGenerate: authProcedure.input(aiSuggestSchema).mutation(async ({ input, ctx }) => {
      return aiServices.service().suggestAndGenerate(input, ctx.user!.id);
    }),

    recurrence: router({
      list: authProcedure
        .input(z.object({ studioId: z.string().uuid() }))
        .query(async ({ input, ctx }) => {
          return aiServices.service().findAiRecurrences(input.studioId, ctx.user!.id);
        }),

      create: authProcedure.input(createAiRecurrenceSchema).mutation(async ({ input, ctx }) => {
        const data = {
          ...input,
          nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : undefined,
        };
        return aiServices.service().createAiRecurrence(data, ctx.user!.id);
      }),

      update: authProcedure
        .input(z.object({ id: z.string().uuid(), data: updateAiRecurrenceSchema }))
        .mutation(async ({ input, ctx }) => {
          const data: {
            prompt?: string | null;
            rule?: "weekly" | "biweekly" | "monthly";
            nextRunAt?: Date | null;
          } = {
            rule: input.data.rule ?? undefined,
            prompt: input.data.prompt === null ? null : (input.data.prompt ?? undefined),
            nextRunAt:
              input.data.nextRunAt === null
                ? null
                : input.data.nextRunAt
                  ? new Date(input.data.nextRunAt)
                  : undefined,
          };
          return aiServices.service().updateAiRecurrence(input.id, data, ctx.user!.id);
        }),

      delete: authProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          return aiServices.service().deleteAiRecurrence(input.id, ctx.user!.id);
        }),

      toggle: authProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          return aiServices.service().toggleAiRecurrence(input.id, ctx.user!.id);
        }),
    }),
  }),

  // Brand Voice
  brandVoice: router({
    getProfile: authProcedure
      .input(z.object({ studioId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        return brandVoiceServices.service().getProfile(input.studioId, ctx.user!.id);
      }),

    upsertProfile: authProcedure
      .input(upsertBrandProfileSchema)
      .mutation(async ({ input, ctx }) => {
        const { studioId, ...data } = input;
        return brandVoiceServices.service().upsertProfile(studioId, data, ctx.user!.id);
      }),

    deleteProfile: authProcedure
      .input(z.object({ studioId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        return brandVoiceServices.service().deleteProfile(input.studioId, ctx.user!.id);
      }),

    setActivePreset: authProcedure
      .input(
        z.object({
          studioId: z.string().uuid(),
          presetId: z.string().uuid().nullable(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return brandVoiceServices
          .service()
          .setActivePreset(input.studioId, input.presetId, ctx.user!.id);
      }),

    presets: authProcedure
      .input(z.object({ studioId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        return brandVoiceServices.service().listPresets(input.studioId, ctx.user!.id);
      }),

    createPreset: authProcedure.input(createTonePresetSchema).mutation(async ({ input, ctx }) => {
      const { studioId, ...data } = input;
      return brandVoiceServices.service().createPreset(studioId, data, ctx.user!.id);
    }),

    updatePreset: authProcedure
      .input(z.object({ id: z.string().uuid(), data: updateTonePresetSchema }))
      .mutation(async ({ input, ctx }) => {
        return brandVoiceServices.service().updatePreset(input.id, input.data, ctx.user!.id);
      }),

    deletePreset: authProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        return brandVoiceServices.service().deletePreset(input.id, ctx.user!.id);
      }),

    suggestAlternatives: authProcedure
      .input(suggestAlternativesSchema)
      .mutation(async ({ input, ctx }) => {
        return brandVoiceServices
          .service()
          .suggestAlternatives(input.studioId, input.word, input.context, ctx.user!.id);
      }),
  }),

  // SEO
  seo: router({
    suggestKeywords: authProcedure
      .input(
        z.object({
          studioId: z.string().uuid(),
          contentId: z.string().uuid(),
          title: z.string(),
          bodyText: z.string(),
          currentKeywords: z.string().array(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return seoServices.service().suggestKeywords(input, ctx.user!.id);
      }),

    studioContents: authProcedure
      .input(
        z.object({
          studioId: z.string().uuid(),
          excludeContentId: z.string().uuid(),
        }),
      )
      .query(async ({ input, ctx }) => {
        return seoServices
          .service()
          .getStudioContentsForLinking(input.studioId, input.excludeContentId, ctx.user!.id);
      }),
  }),

  // Analysis
  analysis: router({
    save: authProcedure
      .input(
        z.object({
          contentId: z.string().uuid(),
          seoScore: z.number().int().min(0),
          aeoScore: z.number().int().min(0),
          geoScore: z.number().int().min(0),
          totalScore: z.number().int().min(0).max(100),
          seoDetails: z.record(z.unknown()),
          aeoDetails: z.record(z.unknown()),
          geoDetails: z.record(z.unknown()),
          analysisVersion: z.string().max(10).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return services.service().saveAnalysisSnapshot(input, ctx.user!.id);
      }),

    history: authProcedure
      .input(z.object({ contentId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        return services.service().getAnalysisHistory(input.contentId, ctx.user!.id);
      }),
  }),

  // Repurpose
  repurpose: router({
    convert: authProcedure.input(convertSchema).mutation(async ({ input, ctx }) => {
      return repurposeServices.service().convert(input, ctx.user!.id);
    }),

    convertBatch: authProcedure.input(convertBatchSchema).mutation(async ({ input, ctx }) => {
      return repurposeServices.service().convertBatch(input, ctx.user!.id);
    }),

    listDerived: authProcedure
      .input(z.object({ contentId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        return repurposeServices.service().listDerived(input.contentId, ctx.user!.id);
      }),
  }),
});

export type ContentStudioRouter = typeof contentStudioRouter;
