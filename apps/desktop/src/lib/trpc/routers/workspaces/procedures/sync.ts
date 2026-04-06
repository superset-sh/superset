import { observable } from "@trpc/server/observable";
import {
	type WorktreeSyncEvent,
	worktreeSyncService,
} from "main/lib/worktree-sync";
import { z } from "zod";
import { publicProcedure, router } from "../../..";

/** Create tRPC procedures for worktree sync (manual triggers and real-time subscription). */
export const createSyncProcedures = () => {
	return router({
		/**
		 * Manually trigger a full sync for a single project.
		 * Imports new worktrees and removes stale ones.
		 */
		syncWorktrees: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.mutation(async ({ input }) => {
				return worktreeSyncService.syncProject(input.projectId);
			}),

		/**
		 * Manually trigger a full sync across all active projects.
		 */
		syncAllWorktrees: publicProcedure.mutation(async () => {
			return worktreeSyncService.syncAllActiveProjects();
		}),

		/**
		 * Subscription that emits events whenever worktrees are auto-synced
		 * (new worktrees imported or stale ones removed).
		 */
		onWorktreeSync: publicProcedure.subscription(() => {
			return observable<WorktreeSyncEvent>((emit) => {
				const handler = (event: WorktreeSyncEvent) => {
					emit.next(event);
				};

				worktreeSyncService.on("sync", handler);

				return () => {
					worktreeSyncService.off("sync", handler);
				};
			});
		}),
	});
};
