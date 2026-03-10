/**
 * AI Image tRPC Router
 */
import {
  adminProcedure,
  authProcedure,
  createSingleServiceContainer,
  router,
} from "../../../core/trpc";
import { z } from "zod";
import type { AiImageService } from "../generation/ai-image.service";
import type { StyleTemplateService } from "../generation/style-template.service";
import type { ContentThemeService } from "../content-theme/content-theme.service";
import {
  generateImageSchema,
  paginationSchema,
  createStyleSchema,
  updateStyleSchema,
  adminHistorySchema,
  createContentThemeSchema,
  updateContentThemeSchema,
} from "../dto";

// ============================================================================
// Service Containers
// ============================================================================

const imageServices = createSingleServiceContainer<AiImageService>();
export const injectAiImageService = imageServices.inject;

const styleServices = createSingleServiceContainer<StyleTemplateService>();
export const injectStyleTemplateService = styleServices.inject;

const contentThemeServices = createSingleServiceContainer<ContentThemeService>();
export const injectContentThemeService = contentThemeServices.inject;

// ============================================================================
// Router
// ============================================================================

export const aiImageRouter = router({
  // Image Generation
  generate: authProcedure
    .input(generateImageSchema)
    .mutation(({ input, ctx }) =>
      imageServices.service().generate(input, ctx.user!.id),
    ),

  getResult: authProcedure
    .input(z.object({ generationId: z.string().uuid() }))
    .query(({ input }) =>
      imageServices.service().getResult(input.generationId),
    ),

  history: authProcedure
    .input(paginationSchema)
    .query(({ input, ctx }) =>
      imageServices.service().getHistory(ctx.user!.id, input),
    ),

  delete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      imageServices.service().delete(input.id, ctx.user!.id),
    ),

  reuse: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ input, ctx }) =>
      imageServices.service().getReuse(input.id, ctx.user!.id),
    ),

  // Style Templates
  styleTemplates: authProcedure
    .query(() =>
      styleServices.service().findActive(),
    ),

  // Content Themes
  contentThemes: authProcedure
    .query(() =>
      contentThemeServices.service().findActive(),
    ),

  // Admin Procedures
  adminHistory: adminProcedure
    .input(adminHistorySchema)
    .query(({ input }) =>
      imageServices.service().adminGetHistory(input),
    ),

  createStyle: adminProcedure
    .input(createStyleSchema)
    .mutation(({ input }) =>
      styleServices.service().create(input),
    ),

  updateStyle: adminProcedure
    .input(updateStyleSchema)
    .mutation(({ input }) =>
      styleServices.service().update(input.id, input.data),
    ),

  deleteStyle: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) =>
      styleServices.service().delete(input.id),
    ),

  // Content Theme Admin
  createContentTheme: adminProcedure
    .input(createContentThemeSchema)
    .mutation(({ input }) =>
      contentThemeServices.service().create(input),
    ),

  updateContentTheme: adminProcedure
    .input(updateContentThemeSchema)
    .mutation(({ input }) =>
      contentThemeServices.service().update(input.id, input.data),
    ),

  deleteContentTheme: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) =>
      contentThemeServices.service().delete(input.id),
    ),
});

export type AiImageRouter = typeof aiImageRouter;
