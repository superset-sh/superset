import { z } from "zod";
import { protectedProcedure } from "../../index";
import { destroyWorkspace } from "./workspace-cleanup";

export const archive = protectedProcedure
	.input(
		z.object({
			workspaceId: z.string(),
			force: z.boolean().default(false),
			skipTeardown: z.boolean().default(false),
		}),
	)
	.mutation(({ ctx, input }) =>
		destroyWorkspace(ctx, {
			workspaceId: input.workspaceId,
			force: input.force,
			teardownMode: input.skipTeardown ? "skip" : "blocking",
			archive: true,
			deleteBranch: false,
		}),
	);
