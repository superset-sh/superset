import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions, workspaces } from "../../../db/schema";
import {
	createTerminalSessionInternal,
	disposeSession,
	listTerminalSessions,
	parseThemeType,
} from "../../../terminal/terminal";
import { protectedProcedure, router } from "../../index";

export const terminalRouter = router({
	launchSession: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				terminalId: z.string().optional(),
				initialCommand: z.string().min(1),
				themeType: z.string().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const terminalId = input.terminalId ?? crypto.randomUUID();
			const result = createTerminalSessionInternal({
				terminalId,
				workspaceId: input.workspaceId,
				themeType: parseThemeType(input.themeType),
				db: ctx.db,
				eventBus: ctx.eventBus,
				initialCommand: input.initialCommand,
			});

			if ("error" in result) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: result.error,
				});
			}

			return { terminalId: result.terminalId, status: "active" as const };
		}),

	listSessions: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
			}),
		)
		.query(({ input }) => ({
			sessions: listTerminalSessions({
				workspaceId: input.workspaceId,
				includeExited: false,
			}),
		})),

	killSession: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const session = ctx.db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
				.sync();

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Terminal session not found",
				});
			}

			if (session.originWorkspaceId !== input.workspaceId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Terminal session does not belong to this workspace",
				});
			}

			disposeSession(input.terminalId, ctx.db);
			return { terminalId: input.terminalId, status: "disposed" as const };
		}),
});
