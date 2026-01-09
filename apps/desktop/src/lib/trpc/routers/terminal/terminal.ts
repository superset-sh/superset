import fs from "node:fs/promises";
import path from "node:path";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	DaemonTerminalManager,
	getActiveTerminalManager,
} from "main/lib/terminal";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { assertWorkspaceUsable } from "../workspaces/utils/usability";
import { getWorkspacePath } from "../workspaces/utils/worktree";
import { resolveCwd } from "./utils";

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
let createOrAttachCallCounter = 0;

/**
 * Terminal router using TerminalManager with node-pty
 * Sessions are keyed by paneId and linked to workspaces for cwd resolution
 *
 * Environment variables set for terminal sessions:
 * - PATH: Prepends ~/.superset/bin so wrapper scripts intercept agent commands
 * - SUPERSET_PANE_ID: The pane ID (used by notification hooks, session key)
 * - SUPERSET_TAB_ID: The tab ID (parent of pane, used by notification hooks)
 * - SUPERSET_WORKSPACE_ID: The workspace ID (used by notification hooks)
 * - SUPERSET_WORKSPACE_NAME: The workspace name (used by setup/teardown scripts)
 * - SUPERSET_WORKSPACE_PATH: The worktree path (used by setup/teardown scripts)
 * - SUPERSET_ROOT_PATH: The main repo path (used by setup/teardown scripts)
 * - SUPERSET_PORT: The hooks server port for agent completion notifications
 */
export const createTerminalRouter = () => {
	// Get the active terminal manager (in-process or daemon-based)
	const terminalManager = getActiveTerminalManager();
	if (DEBUG_TERMINAL) {
		console.log(
			"[Terminal Router] Using terminal manager:",
			terminalManager.constructor.name,
		);
	}

	return router({
		createOrAttach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					tabId: z.string(),
					workspaceId: z.string(),
					cols: z.number().optional(),
					rows: z.number().optional(),
					cwd: z.string().optional(),
					initialCommands: z.array(z.string()).optional(),
					skipColdRestore: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const callId = ++createOrAttachCallCounter;
				const startedAt = Date.now();
				const {
					paneId,
					tabId,
					workspaceId,
					cols,
					rows,
					cwd: cwdOverride,
					initialCommands,
					skipColdRestore,
				} = input;

				// Resolve cwd: absolute paths stay as-is, relative paths resolve against workspace path
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, workspaceId))
					.get();
				const workspacePath = workspace
					? (getWorkspacePath(workspace) ?? undefined)
					: undefined;
				if (workspace?.type === "worktree") {
					assertWorkspaceUsable(workspaceId, workspacePath);
				}
				const cwd = resolveCwd(cwdOverride, workspacePath);

				if (DEBUG_TERMINAL) {
					console.log("[Terminal Router] createOrAttach called:", {
						paneId,
						workspaceId,
						workspacePath,
						cwdOverride,
						resolvedCwd: cwd,
						cols,
						rows,
					});
				}

				// Get project info for environment variables
				const project = workspace
					? localDb
							.select()
							.from(projects)
							.where(eq(projects.id, workspace.projectId))
							.get()
					: undefined;

				try {
					const result = await terminalManager.createOrAttach({
						paneId,
						tabId,
						workspaceId,
						workspaceName: workspace?.name,
						workspacePath,
						rootPath: project?.mainRepoPath,
						cwd,
						cols,
						rows,
						initialCommands,
						skipColdRestore,
					});

					if (DEBUG_TERMINAL) {
						console.log("[Terminal Router] createOrAttach result:", {
							callId,
							paneId,
							isNew: result.isNew,
							wasRecovered: result.wasRecovered,
							durationMs: Date.now() - startedAt,
						});
					}

					return {
						paneId,
						isNew: result.isNew,
						scrollback: result.scrollback,
						wasRecovered: result.wasRecovered,
						// Cold restore fields (for reboot recovery)
						isColdRestore: result.isColdRestore,
						previousCwd: result.previousCwd,
						// Include snapshot for daemon mode (renderer can use for rehydration)
						snapshot: result.snapshot,
					};
				} catch (error) {
					if (DEBUG_TERMINAL) {
						console.warn("[Terminal Router] createOrAttach failed:", {
							callId,
							paneId,
							durationMs: Date.now() - startedAt,
							error: error instanceof Error ? error.message : String(error),
						});
					}
					console.error("[Terminal Router] createOrAttach ERROR:", error);
					throw error;
				}
			}),

		write: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					data: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				try {
					terminalManager.write(input);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Write failed";

					// If session is gone, emit exit instead of error.
					// This prevents error toast floods when workspaces with terminals are deleted.
					if (message.includes("not found or not alive")) {
						// SIGTERM (15) - synthetic signal for consistent event typing.
						terminalManager.emit(`exit:${input.paneId}`, 0, 15);
						return;
					}

					terminalManager.emit(`error:${input.paneId}`, {
						error: message,
						code: "WRITE_FAILED",
					});
				}
			}),

		/**
		 * Acknowledge cold restore - clears the sticky cold restore info.
		 * Call this after displaying the cold restore UI and starting a new shell.
		 */
		ackColdRestore: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				terminalManager.ackColdRestore(input.paneId);
			}),

		resize: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					cols: z.number(),
					rows: z.number(),
					seq: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.resize(input);
			}),

		signal: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					signal: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.signal(input);
			}),

		kill: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminalManager.kill(input);
			}),

		/**
		 * Detach from terminal (keep session alive)
		 */
		detach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.detach(input);
			}),

		/**
		 * Clear scrollback buffer for terminal (used by Cmd+K / clear command)
		 * This clears both in-memory scrollback and persistent history file
		 */
		clearScrollback: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminalManager.clearScrollback(input);
			}),

		listDaemonSessions: publicProcedure.query(async () => {
			if (!(terminalManager instanceof DaemonTerminalManager)) {
				return { daemonModeEnabled: false, sessions: [] };
			}

			const response = await terminalManager.listDaemonSessions();
			return { daemonModeEnabled: true, sessions: response.sessions };
		}),

		killAllDaemonSessions: publicProcedure.mutation(async () => {
			if (!(terminalManager instanceof DaemonTerminalManager)) {
				return { daemonModeEnabled: false, killedCount: 0 };
			}

			const { sessions } = await terminalManager.listDaemonSessions();
			await terminalManager.forceKillAll();
			return { daemonModeEnabled: true, killedCount: sessions.length };
		}),

		killDaemonSessionsForWorkspace: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				if (!(terminalManager instanceof DaemonTerminalManager)) {
					return { daemonModeEnabled: false, killedCount: 0 };
				}

				const { sessions } = await terminalManager.listDaemonSessions();
				const toKill = sessions.filter(
					(session) => session.workspaceId === input.workspaceId,
				);

				for (const session of toKill) {
					await terminalManager.kill({ paneId: session.sessionId });
				}

				return { daemonModeEnabled: true, killedCount: toKill.length };
			}),

		clearTerminalHistory: publicProcedure.mutation(async () => {
			// Note: Disk-based terminal history was removed. This is now a no-op
			// for non-daemon mode. In daemon mode, it resets the history persistence.
			if (terminalManager instanceof DaemonTerminalManager) {
				await terminalManager.resetHistoryPersistence();
			}

			return { success: true };
		}),

		getSession: publicProcedure
			.input(z.string())
			.query(async ({ input: paneId }) => {
				return terminalManager.getSession(paneId);
			}),

		/**
		 * Get the current working directory for a workspace
		 * This is used for resolving relative file paths in terminal output
		 */
		getWorkspaceCwd: publicProcedure
			.input(z.string())
			.query(({ input: workspaceId }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, workspaceId))
					.get();
				if (!workspace) {
					return null;
				}

				if (!workspace.worktreeId) {
					return null;
				}

				const worktree = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, workspace.worktreeId))
					.get();
				return worktree?.path ?? null;
			}),

		/**
		 * List directory contents for navigation
		 * Returns directories and files in the specified path
		 */
		listDirectory: publicProcedure
			.input(
				z.object({
					dirPath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const { dirPath } = input;

				try {
					const entries = await fs.readdir(dirPath, { withFileTypes: true });

					const items = entries
						.filter((entry) => !entry.name.startsWith("."))
						.map((entry) => ({
							name: entry.name,
							path: path.join(dirPath, entry.name),
							isDirectory: entry.isDirectory(),
						}))
						.sort((a, b) => {
							// Directories first, then alphabetical
							if (a.isDirectory && !b.isDirectory) return -1;
							if (!a.isDirectory && b.isDirectory) return 1;
							return a.name.localeCompare(b.name);
						});

					// Get parent directory
					const parentPath = path.dirname(dirPath);
					const hasParent = parentPath !== dirPath;

					return {
						currentPath: dirPath,
						parentPath: hasParent ? parentPath : null,
						items,
					};
				} catch {
					return {
						currentPath: dirPath,
						parentPath: null,
						items: [],
						error: "Unable to read directory",
					};
				}
			}),

		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: paneId }) => {
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number; signal?: number }
					| { type: "disconnect"; reason: string }
					| { type: "error"; error: string; code?: string }
				>((emit) => {
					if (DEBUG_TERMINAL) {
						console.log(`[Terminal Stream] Subscribe: ${paneId}`);
					}

					let firstDataReceived = false;

					const onData = (data: string) => {
						if (DEBUG_TERMINAL && !firstDataReceived) {
							firstDataReceived = true;
							console.log(
								`[Terminal Stream] First data for ${paneId}: ${data.length} bytes`,
							);
						}
						emit.next({ type: "data", data });
					};

					const onExit = (exitCode: number, signal?: number) => {
						// IMPORTANT: Do not `emit.complete()` on exit.
						// The renderer uses a stable `paneId` input and `@trpc/react-query`
						// won't auto-resubscribe after completion unless the subscription key changes.
						// We reuse the same paneId across restarts/cold restore, so completing here
						// would strand the pane with no listeners (terminal output never renders again).
						emit.next({ type: "exit", exitCode, signal });
					};

					const onDisconnect = (reason: string) => {
						emit.next({ type: "disconnect", reason });
					};

					const onError = (payload: { error: string; code?: string }) => {
						emit.next({
							type: "error",
							error: payload.error,
							code: payload.code,
						});
					};

					terminalManager.on(`data:${paneId}`, onData);
					terminalManager.on(`exit:${paneId}`, onExit);
					terminalManager.on(`disconnect:${paneId}`, onDisconnect);
					terminalManager.on(`error:${paneId}`, onError);

					// Cleanup on unsubscribe
					return () => {
						if (DEBUG_TERMINAL) {
							console.log(`[Terminal Stream] Unsubscribe: ${paneId}`);
						}
						terminalManager.off(`data:${paneId}`, onData);
						terminalManager.off(`exit:${paneId}`, onExit);
						terminalManager.off(`disconnect:${paneId}`, onDisconnect);
						terminalManager.off(`error:${paneId}`, onError);
					};
				});
			}),
	});
};
