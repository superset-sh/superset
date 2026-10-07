import { realpathSync } from "node:fs";
import { join } from "node:path";
import {
	projects,
	settings,
	v1MigrationState,
	workspaceSections,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { appState } from "main/lib/app-state";
import { localDb } from "main/lib/local-db";
import { getTerminalHostClient } from "main/lib/terminal-host/client";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { createRunLock } from "./utils/run-lock";
import { listLiveV1Sessions, stopV1Sessions } from "./utils/v1-daemon-sessions";
import { collectV1TerminalPanes } from "./utils/v1-terminal-panes";

const ledgerEntrySchema = z.object({
	v1Id: z.string().min(1),
	kind: z.enum(["project", "workspace", "preset", "settings", "terminal"]),
	status: z.enum(["success", "linked", "error", "skipped"]),
	v2Id: z.string().nullish(),
	reason: z.string().nullish(),
});

function watchHolder(
	window: BrowserWindow | null,
	onGone: () => void,
): (() => void) | null {
	if (!window || window.isDestroyed()) return null;
	const contents = window.webContents;
	contents.on("did-navigate", onGone);
	contents.on("render-process-gone", onGone);
	contents.on("destroyed", onGone);
	return () => {
		if (contents.isDestroyed()) return;
		contents.off("did-navigate", onGone);
		contents.off("render-process-gone", onGone);
		contents.off("destroyed", onGone);
	};
}

export const createMigrationRouter = () => {
	const runLock = createRunLock({
		path: join(SUPERSET_HOME_DIR, "v1-migration.lock"),
	});
	let detachHolder: (() => void) | null = null;

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

		readV1Groups: publicProcedure.query(() => {
			return localDb.select().from(workspaceSections).all();
		}),

		readV1Worktrees: publicProcedure.query(() => {
			return localDb.select().from(worktrees).all();
		}),

		resolvePaths: publicProcedure
			.input(z.object({ paths: z.array(z.string()) }))
			.query(({ input }) =>
				input.paths.map((path) => {
					try {
						return realpathSync.native(path);
					} catch {
						return null;
					}
				}),
			),

		readV1Settings: publicProcedure.query(() => {
			return localDb.select().from(settings).get() ?? null;
		}),

		/**
		 * v1 terminal panes from app-state.json, resolved to their workspace
		 * and best-known cwd. Terminal sessions themselves can't migrate (v1
		 * and v2 own separate daemon sessions) — the cwd is what carries over.
		 */
		readV1TerminalPanes: publicProcedure.query(() =>
			collectV1TerminalPanes(appState.data),
		),

		/**
		 * Latest captured agent session per v1 pane (see V1PaneAgentSession).
		 * Read at v2 pane-creation time — not frozen into the migration plan —
		 * because the pane keeps living in v1 (and its agent keeps reporting)
		 * long after the every-boot migration pass ledgers it.
		 */
		readV1PaneAgentSessions: publicProcedure
			.input(z.object({ paneIds: z.array(z.string().min(1)) }))
			.query(({ input }) => {
				const sessions = appState.data.v1AgentSessions ?? {};
				return Object.fromEntries(
					input.paneIds.flatMap((paneId) => {
						const session = sessions[paneId];
						return session ? [[paneId, session] as const] : [];
					}),
				);
			}),

		listLiveV1Sessions: publicProcedure.query(() =>
			listLiveV1Sessions(getTerminalHostClient()),
		),

		stopV1Sessions: publicProcedure
			.input(z.object({ paneIds: z.array(z.string().min(1)) }))
			.mutation(({ input }) =>
				stopV1Sessions(getTerminalHostClient(), input.paneIds),
			),

		// A hold ends when its window reloads or closes, so a renderer that dies
		// mid-pass can't keep the lock.
		acquireRunLock: publicProcedure.mutation(({ ctx }) => {
			const result = runLock.acquire();
			if (result.acquired) {
				detachHolder?.();
				detachHolder = watchHolder(ctx.senderWindow, () => {
					if (!runLock.release(result.token)) return;
					detachHolder?.();
					detachHolder = null;
				});
			}
			return result;
		}),

		releaseRunLock: publicProcedure
			.input(z.object({ token: z.string() }).optional())
			.mutation(({ input }) => {
				if (runLock.release(input?.token)) {
					detachHolder?.();
					detachHolder = null;
				}
			}),

		ledgerOwners: publicProcedure.query(() => {
			return localDb
				.select({
					organizationId: v1MigrationState.organizationId,
					v1Id: v1MigrationState.v1Id,
					kind: v1MigrationState.kind,
				})
				.from(v1MigrationState)
				.where(
					and(
						inArray(v1MigrationState.kind, ["project", "workspace"]),
						inArray(v1MigrationState.status, ["success", "linked"]),
					),
				)
				.all();
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
