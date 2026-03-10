import { publicProcedure, router } from "../../../core/trpc";
import { z } from "zod";
import { getCommunityServices } from "./index";

export const karmaRouter = router({
  get: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { karmaService } = getCommunityServices();
      return karmaService.getKarma(input.userId);
    }),

  getBatch: publicProcedure
    .input(
      z.object({
        userIds: z.array(z.string()).max(50),
      }),
    )
    .query(async ({ input }) => {
      const { karmaService } = getCommunityServices();
      return karmaService.getBatchKarma(input.userIds);
    }),
});

export type KarmaRouterType = typeof karmaRouter;
