import fs from "node:fs/promises";
import path from "node:path";
import { projects, workspaces, worktrees, remoteWorkspaces, remoteProjects } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { assertWorkspaceUsable } from "../workspaces/utils/usability";
import { getWorkspacePath } from "../workspaces/utils/worktree";
import { resolveCwd } from "./utils";

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
let createOrAttachCallCounter = 0;

const TERMINAL_SESSION_KILLED_MESSAGE = "TERMINAL_SESSION_KILLED";
const userKilledSessions = new Set<string>();
// Track paneId -> workspaceId mapping for routing terminal operations
const paneToWorkspace = new Map<string, string>();
const SAFE_ID = z
	.string()
	.min(1)
	.refine(
		(value) =>
			!value.includes("/") && !value.includes("\\") && !value.includes(".."),
		{ message: "Invalid id" },
	);

/**
 * Helper to get terminal runtime for a workspace.
 * Returns SSH terminal for SSH workspaces, local terminal otherwise.
 */
function getTerminalForWorkspace(workspaceId: string) {
	const registry = getWorkspaceRuntimeRegistry();
	return registry.getForWorkspaceId(workspaceId).terminal;
}

/**
 * Helper to get terminal runtime for a pane.
 * Uses the paneId -> workspaceId mapping to determine the correct terminal.
 */
function getTerminalForPane(paneId: string) {
	const workspaceId = paneToWorkspace.get(paneId);
	if (workspaceId) {
		return getTerminalForWorkspace(workspaceId);
	}
	// Fall back to default terminal if mapping not found
	const registry = getWorkspaceRuntimeRegistry();
	return registry.getDefault().terminal;
}

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
	// Get the workspace runtime registry (selects backend based on settings)
	const registry = getWorkspaceRuntimeRegistry();
	const defaultTerminal = registry.getDefault().terminal;
	if (DEBUG_TERMINAL) {
		console.log(
			"[Terminal Router] Using terminal runtime, capabilities:",
			defaultTerminal.capabilities,
		);
	}

	return router({
		createOrAttach: publicProcedure
			.input(
				z.object({
					paneId: SAFE_ID,
					tabId: z.string(),
					workspaceId: SAFE_ID,
					cols: z.number().optional(),
					rows: z.number().optional(),
					cwd: z.string().optional(),
					initialCommands: z.array(z.string()).optional(),
					skipColdRestore: z.boolean().optional(),
					allowKilled: z.boolean().optional(),
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
					allowKilled,
				} = input;

				if (allowKilled) {
					userKilledSessions.delete(paneId);
				} else if (userKilledSessions.has(paneId)) {
					if (DEBUG_TERMINAL) {
						console.warn("[Terminal Router] createOrAttach blocked (killed):", {
							paneId,
							workspaceId,
						});
					}
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: TERMINAL_SESSION_KILLED_MESSAGE,
					});
				}

				// Check if this is a remote workspace
				const isRemote = registry.isSSHWorkspace(workspaceId);
				let workspacePath: string | undefined;
				let workspaceName: string | undefined;
				let rootPath: string | undefined;

				if (isRemote) {
					// Remote workspace - get path from remoteWorkspaces/remoteProjects
					const remoteWs = localDb
						.select()
						.from(remoteWorkspaces)
						.where(eq(remoteWorkspaces.id, workspaceId))
						.get();

					if (remoteWs) {
						workspaceName = remoteWs.name;
						const remoteProject = localDb
							.select()
							.from(remoteProjects)
							.where(eq(remoteProjects.id, remoteWs.remoteProjectId))
							.get();

						if (remoteProject) {
							workspacePath = remoteProject.remotePath;
							rootPath = remoteProject.remotePath;
						}
					}
				} else {
					// Local workspace - existing logic
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.id, workspaceId))
						.get();
					workspacePath = workspace
						? (getWorkspacePath(workspace) ?? undefined)
						: undefined;
					workspaceName = workspace?.name;

					if (workspace?.type === "worktree") {
						assertWorkspaceUsable(workspaceId, workspacePath);
					}

					// Get project info for environment variables
					const project = workspace
						? localDb
								.select()
								.from(projects)
								.where(eq(projects.id, workspace.projectId))
								.get()
						: undefined;
					rootPath = project?.mainRepoPath;
				}

				const cwd = resolveCwd(cwdOverride, workspacePath, isRemote);

				if (DEBUG_TERMINAL) {
					console.log("[Terminal Router] createOrAttach called:", {
						paneId,
						workspaceId,
						workspacePath,
						cwdOverride,
						resolvedCwd: cwd,
						cols,
						rows,
						isRemote,
					});
				}

				// Store paneId -> workspaceId mapping FIRST so concurrent operations
				// (like stream subscription, resize) route to the correct terminal
				paneToWorkspace.set(paneId, workspaceId);

				// Get the terminal for this workspace (SSH or local)
				const terminal = getTerminalForWorkspace(workspaceId);

				try {
					const result = await terminal.createOrAttach({
						paneId,
						tabId,
						workspaceId,
						workspaceName,
						workspacePath,
						rootPath,
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
						viewportY: result.viewportY,
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
				const terminal = getTerminalForPane(input.paneId);
				try {
					terminal.write(input);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Write failed";

					// If session is gone, emit exit instead of error.
					// This prevents error toast floods when workspaces with terminals are deleted.
					if (message.includes("not found or not alive")) {
						// SIGTERM (15) - synthetic signal for consistent event typing.
						terminal.emit(`exit:${input.paneId}`, 0, 15);
						return;
					}

					terminal.emit(`error:${input.paneId}`, {
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
				const terminal = getTerminalForPane(input.paneId);
				terminal.ackColdRestore(input.paneId);
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
				const terminal = getTerminalForPane(input.paneId);
				terminal.resize(input);
			}),

		signal: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					signal: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const terminal = getTerminalForPane(input.paneId);
				terminal.signal(input);
			}),

		kill: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const terminal = getTerminalForPane(input.paneId);
				userKilledSessions.add(input.paneId);
				paneToWorkspace.delete(input.paneId); // Clean up mapping
				await terminal.kill(input);
			}),

		/**
		 * Detach from terminal (keep session alive)
		 */
		detach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					viewportY: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const terminal = getTerminalForPane(input.paneId);
				terminal.detach(input);
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
				const terminal = getTerminalForPane(input.paneId);
				await terminal.clearScrollback(input);
			}),

		listDaemonSessions: publicProcedure.query(async () => {
			// Use capability-based check instead of instanceof (local terminal only)
			if (!defaultTerminal.management) {
				return { daemonModeEnabled: false, sessions: [] };
			}

			const response = await defaultTerminal.management.listSessions();
			return { daemonModeEnabled: true, sessions: response.sessions };
		}),

		killAllDaemonSessions: publicProcedure.mutation(async () => {
			// Use capability-based check instead of instanceof (local terminal only)
			if (!defaultTerminal.management) {
				return { daemonModeEnabled: false, killedCount: 0, remainingCount: 0 };
			}

			// Get sessions before kill for accurate count
			const before = await defaultTerminal.management.listSessions();
			const beforeIds = before.sessions.map((s) => s.sessionId);
			for (const id of beforeIds) {
				userKilledSessions.add(id);
			}
			console.log(
				"[killAllDaemonSessions] Before kill:",
				beforeIds.length,
				"sessions",
				beforeIds,
			);

			// Request kill of all sessions
			await defaultTerminal.management.killAllSessions();

			// Wait and verify loop - poll until sessions are actually dead
			// This ensures we don't return success before daemon has finished cleanup
			const MAX_RETRIES = 10;
			const RETRY_DELAY_MS = 100;
			let remainingCount = before.sessions.length;
			let afterIds: string[] = [];

			for (let i = 0; i < MAX_RETRIES && remainingCount > 0; i++) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
				const after = await defaultTerminal.management.listSessions();
				afterIds = after.sessions
					.filter((s) => s.isAlive)
					.map((s) => s.sessionId);
				remainingCount = afterIds.length;

				if (remainingCount > 0) {
					console.log(
						`[killAllDaemonSessions] Retry ${i + 1}/${MAX_RETRIES}: ${remainingCount} sessions still alive`,
						afterIds,
					);
				}
			}

			const killedCount = before.sessions.length - remainingCount;
			console.log(
				"[killAllDaemonSessions] Complete:",
				killedCount,
				"killed,",
				remainingCount,
				"remaining",
				remainingCount > 0 ? afterIds : [],
			);

			return { daemonModeEnabled: true, killedCount, remainingCount };
		}),

		killDaemonSessionsForWorkspace: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				// Use capability-based check instead of instanceof (local terminal only)
				if (!defaultTerminal.management) {
					return { daemonModeEnabled: false, killedCount: 0 };
				}

				const { sessions } = await defaultTerminal.management.listSessions();
				const toKill = sessions.filter(
					(session) => session.workspaceId === input.workspaceId,
				);

				for (const session of toKill) {
					userKilledSessions.add(session.sessionId);
					await defaultTerminal.kill({ paneId: session.sessionId });
				}

				return { daemonModeEnabled: true, killedCount: toKill.length };
			}),

		clearTerminalHistory: publicProcedure.mutation(async () => {
			// Note: Disk-based terminal history was removed. This is now a no-op
			// for non-daemon mode. In daemon mode, it resets the history persistence.
			if (defaultTerminal.management) {
				await defaultTerminal.management.resetHistoryPersistence();
			}

			return { success: true };
		}),

		getSession: publicProcedure
			.input(z.string())
			.query(async ({ input: paneId }) => {
				const terminal = getTerminalForPane(paneId);
				return terminal.getSession(paneId);
			}),

		/**
		 * Get the current working directory for a workspace
		 * This is used for resolving relative file paths in terminal output
		 */
		getWorkspaceCwd: publicProcedure
			.input(z.string())
			.query(({ input: workspaceId }) => {
				// Check if it's a remote workspace
				if (registry.isSSHWorkspace(workspaceId)) {
					const remoteWs = localDb
						.select()
						.from(remoteWorkspaces)
						.where(eq(remoteWorkspaces.id, workspaceId))
						.get();
					if (remoteWs) {
						const remoteProject = localDb
							.select()
							.from(remoteProjects)
							.where(eq(remoteProjects.id, remoteWs.remoteProjectId))
							.get();
						return remoteProject?.remotePath ?? null;
					}
					return null;
				}

				// Local workspace
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
			.input(z.object({ paneId: z.string(), workspaceId: z.string().optional() }))
			.subscription(({ input }) => {
				const { paneId, workspaceId } = input;
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number; signal?: number }
					| { type: "disconnect"; reason: string }
					| { type: "error"; error: string; code?: string }
				>((emit) => {
					if (DEBUG_TERMINAL) {
						console.log(`[Terminal Stream] Subscribe: ${paneId}, workspaceId: ${workspaceId}`);
					}

					// Get the terminal for this workspace/pane
					// If workspaceId is provided, use it directly for routing
					// Otherwise fall back to the paneId mapping
					const terminal = workspaceId
						? getTerminalForWorkspace(workspaceId)
						: getTerminalForPane(paneId);

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

					terminal.on(`data:${paneId}`, onData);
					terminal.on(`exit:${paneId}`, onExit);
					terminal.on(`disconnect:${paneId}`, onDisconnect);
					terminal.on(`error:${paneId}`, onError);

					// Cleanup on unsubscribe
					return () => {
						if (DEBUG_TERMINAL) {
							console.log(`[Terminal Stream] Unsubscribe: ${paneId}`);
						}
						terminal.off(`data:${paneId}`, onData);
						terminal.off(`exit:${paneId}`, onExit);
						terminal.off(`disconnect:${paneId}`, onDisconnect);
						terminal.off(`error:${paneId}`, onError);
					};
				});
			}),
	});
};
