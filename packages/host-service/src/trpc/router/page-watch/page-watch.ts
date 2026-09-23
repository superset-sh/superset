import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PageWatchStatus } from "../../../page-watch/index.ts";
import { listTerminalSessions } from "../../../terminal/terminal.ts";
import { protectedProcedure, router } from "../../index";

const assignInputSchema = z.object({
	pageId: z.string().uuid(),
	slug: z.string().min(1),
	title: z.string().min(1),
	workspaceId: z.string().min(1),
	terminalId: z.string().min(1),
	agentId: z.string().min(1).nullable().default(null),
});

const pageInputSchema = z.object({ pageId: z.string().uuid() });

const listInputSchema = z
	.object({ workspaceId: z.string().min(1).optional() })
	.optional();

export interface PageWatchStatusWithSession extends PageWatchStatus {
	sessionTitle: string | null;
}

/**
 * The watching terminal's tab name, as the person watching it reads it — a
 * rename if they gave one, else the title the agent set. A viewer listing
 * watchers across hosts cannot ask each host for its terminals, so the name
 * travels with the watch row rather than being joined to it.
 */
function withSessionTitles(
	statuses: PageWatchStatus[],
): PageWatchStatusWithSession[] {
	if (statuses.length === 0) return [];
	const titles = new Map(
		listTerminalSessions().map((session) => [
			session.terminalId,
			session.title,
		]),
	);
	return statuses.map((status) => ({
		...status,
		sessionTitle: titles.get(status.terminalId) ?? null,
	}));
}

export const pageWatchRouter = router({
	assign: protectedProcedure
		.input(assignInputSchema)
		.mutation(async ({ ctx, input }): Promise<PageWatchStatusWithSession[]> => {
			try {
				await ctx.runtime.pageWatch.assign(input);
			} catch (error) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: error instanceof Error ? error.message : "Cannot watch page",
				});
			}
			return withSessionTitles(ctx.runtime.pageWatch.list(input.workspaceId));
		}),

	unwatch: protectedProcedure
		.input(pageInputSchema)
		.mutation(async ({ ctx, input }): Promise<{ pageId: string }> => {
			await ctx.runtime.pageWatch.unwatch(input.pageId);
			return { pageId: input.pageId };
		}),

	getAll: protectedProcedure
		.input(listInputSchema)
		.query(({ ctx, input }): PageWatchStatusWithSession[] =>
			withSessionTitles(ctx.runtime.pageWatch.list(input?.workspaceId)),
		),
});
