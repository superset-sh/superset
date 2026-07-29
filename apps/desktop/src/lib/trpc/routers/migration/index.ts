import {
	projects,
	settings,
	v1MigrationState,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { appState } from "main/lib/app-state";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const ledgerEntrySchema = z.object({
	v1Id: z.string().min(1),
	kind: z.enum(["project", "workspace", "preset", "settings", "terminal"]),
	status: z.enum(["success", "linked", "error", "skipped"]),
	v2Id: z.string().nullish(),
	reason: z.string().nullish(),
});

export const createMigrationRouter = () => {
	return router({
		readV1Projects: publicProcedure.query(() => {
			// Only surface pinned projects. v1's `hideProject` nulls tab_order
			// when the last workspace in a project is deleted, effectively
			// abandoning the project — don't resurrect those in v2.
			return localDb
				.select()
				.from(projects)
				.where(isNotNull(projects.tabOrder))
				.all();
		}),

		readV1Workspaces: publicProcedure.query(() => {
			return localDb
				.select()
				.from(workspaces)
				.where(isNull(workspaces.deletingAt))
				.all();
		}),

		readV1Worktrees: publicProcedure.query(() => {
			return localDb.select().from(worktrees).all();
		}),

		readV1Settings: publicProcedure.query(() => {
			return localDb.select().from(settings).get() ?? null;
		}),

		/**
		 * v1 terminal panes from app-state.json, resolved to their workspace
		 * and best-known cwd. Terminal sessions themselves can't migrate (v1
		 * and v2 own separate daemon sessions) — the cwd is what carries over.
		 */
		readV1TerminalPanes: publicProcedure.query(() => {
			const tabsState = appState.data.tabsState;
			const workspaceIdByTabId = new Map(
				tabsState.tabs.map((tab) => [tab.id, tab.workspaceId]),
			);
			return Object.values(tabsState.panes)
				.filter((pane) => pane.type === "terminal")
				.flatMap((pane) => {
					const v1WorkspaceId = workspaceIdByTabId.get(pane.tabId);
					if (!v1WorkspaceId) return [];
					return [
						{
							paneId: pane.id,
							v1WorkspaceId,
							cwd: pane.cwd ?? pane.initialCwd ?? null,
						},
					];
				});
		}),

		ledgerList: publicProcedure
			.input(z.object({ organizationId: z.string().min(1) }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(v1MigrationState)
					.where(eq(v1MigrationState.organizationId, input.organizationId))
					.all();
			}),

		ledgerRecord: publicProcedure
			.input(
				z.object({
					organizationId: z.string().min(1),
					entries: z.array(ledgerEntrySchema).min(1),
				}),
			)
			.mutation(({ input }) => {
				for (const entry of input.entries) {
					localDb
						.insert(v1MigrationState)
						.values({
							organizationId: input.organizationId,
							v1Id: entry.v1Id,
							kind: entry.kind,
							status: entry.status,
							v2Id: entry.v2Id ?? null,
							reason: entry.reason ?? null,
						})
						.onConflictDoUpdate({
							target: [
								v1MigrationState.organizationId,
								v1MigrationState.v1Id,
								v1MigrationState.kind,
							],
							set: {
								status: entry.status,
								v2Id: entry.v2Id ?? null,
								reason: entry.reason ?? null,
								migratedAt: Date.now(),
							},
						})
						.run();
				}
			}),
	});
};
