import { z } from "zod";
import {
	createTerminalSessionInternal,
	parseThemeType,
} from "../../../terminal/terminal";
import { protectedProcedure, router } from "../../index";

export const terminalRouter = router({
	ensureSession: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				themeType: z.string().optional(),
				initialCommand: z.string().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const result = createTerminalSessionInternal({
				terminalId: input.terminalId,
				workspaceId: input.workspaceId,
				themeType: parseThemeType(input.themeType),
				db: ctx.db,
				initialCommand: input.initialCommand,
			});

			if ("error" in result) {
				return {
					terminalId: input.terminalId,
					status: "error" as const,
					error: result.error,
				};
			}

			return { terminalId: result.terminalId, status: "active" as const };
		}),
});
