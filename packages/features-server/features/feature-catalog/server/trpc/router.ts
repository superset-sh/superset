import { z } from "zod";
import {
  publicProcedure,
  adminProcedure,
  router,
} from "../../../../core/trpc";
import type { FeatureCatalogService } from "../service";
import {
  createCatalogFeatureSchema,
  updateCatalogFeatureSchema,
} from "../dto";

let featureCatalogService: FeatureCatalogService;
export const setFeatureCatalogService = (service: FeatureCatalogService) => {
  featureCatalogService = service;
};

export const featureCatalogRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          group: z.string().optional(),
          search: z.string().optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return featureCatalogService.findPublished(input ?? undefined);
    }),

  getBySlug: publicProcedure.input(z.string()).query(async ({ input }) => {
    return featureCatalogService.findBySlug(input);
  }),

  getDependencyGraph: publicProcedure
    .input(z.array(z.string()))
    .query(async ({ input }) => {
      return featureCatalogService.getDependencyGraph(input);
    }),

  validateSelection: publicProcedure
    .input(z.array(z.string()))
    .query(async ({ input }) => {
      return featureCatalogService.validateSelection(input);
    }),

  adminList: adminProcedure.query(async () => {
    return featureCatalogService.adminFindAll();
  }),

  adminCreate: adminProcedure
    .input(createCatalogFeatureSchema)
    .mutation(async ({ input }) => {
      return featureCatalogService.create(input);
    }),

  adminUpdate: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updateCatalogFeatureSchema,
      }),
    )
    .mutation(async ({ input }) => {
      return featureCatalogService.update(input.id, input.data);
    }),

  adminReorder: adminProcedure
    .input(
      z.array(
        z.object({
          id: z.string().uuid(),
          order: z.number().int(),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      return featureCatalogService.reorder(input);
    }),

  adminAddDependency: adminProcedure
    .input(
      z.object({
        featureId: z.string().uuid(),
        dependsOnId: z.string().uuid(),
        dependencyType: z
          .enum(["required", "recommended", "optional"])
          .default("required"),
      }),
    )
    .mutation(async ({ input }) => {
      return featureCatalogService.addDependency(
        input.featureId,
        input.dependsOnId,
        input.dependencyType,
      );
    }),

  adminRemoveDependency: adminProcedure
    .input(z.string().uuid())
    .mutation(async ({ input }) => {
      return featureCatalogService.removeDependency(input);
    }),
});

export type FeatureCatalogRouter = typeof featureCatalogRouter;
