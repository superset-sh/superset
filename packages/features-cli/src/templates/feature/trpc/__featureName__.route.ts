import {
  router,
  publicProcedure,
  authProcedure,
  createSingleServiceContainer,
} from "@superbuilder/features-core/trpc";
import { z } from "zod";
import type { {{PascalName}}Service } from "../service/{{featureName}}.service";

const { service: get{{PascalName}}Service, inject: inject{{PascalName}}Service } =
  createSingleServiceContainer<{{PascalName}}Service>();

export { inject{{PascalName}}Service };

export const {{camelName}}Router = router({
  list: publicProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(10) }))
    .query(async ({ input }) => {
      return get{{PascalName}}Service().findAll(input);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return get{{PascalName}}Service().findById(input.id);
    }),

  create: authProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return get{{PascalName}}Service().create({
        ...input,
        authorId: ctx.user!.id,
      });
    }),

  delete: authProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return get{{PascalName}}Service().delete(input.id);
    }),
});

export type {{PascalName}}Router = typeof {{camelName}}Router;
