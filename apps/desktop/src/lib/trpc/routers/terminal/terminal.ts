import { projects, workspaces, worktrees } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { appState } from "main/lib/app-state";
import { localDb } from "main/lib/local-db";
import { restartDaemon as restartDaemonShared } from "main/lib/terminal";
import {
	TERMINAL_SESSION_KILLED_MESSAGE,
	TerminalKilledError,
} from "main/lib/terminal/errors";
import { getTerminalHostClient } from "main/lib/terminal-host/client";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { assertWorkspaceUsable } from "../workspaces/utils/usability";
import { getWorkspacePath } from "../workspaces/utils/worktree";
import { resolveTerminalThemeType } from "./theme-type";
import { resolveCwd } from "./utils";

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
const logger = console;
let createOrAttachCallCounter = 0;

const SAFE_ID = z
	.string()
	.min(1)
	.refine(
		(value) =>
			!value.includes("/") && !value.includes("\\") && !value.includes(".."),
		{ message: "Invalid id" },
	);

/**
 * Terminal router using daemon-backed terminal runtime
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
	const registry = getWorkspaceRuntimeRegistry();
	const terminal = registry.getDefault().terminal;
	if (DEBUG_TERMINAL) {
		console.log(
			"[Terminal Router] Using terminal runtime, capabilities:",
			terminal.capabilities,
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
					themeType: z.enum(["dark", "light"]).optional(),
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
					themeType,
				} = input;

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

				const project = workspace
					? localDb
							.select()
							.from(projects)
							.where(eq(projects.id, workspace.projectId))
							.get()
					: undefined;
				const resolvedThemeType = resolveTerminalThemeType({
					requestedThemeType: themeType,
					persistedThemeState: appState.data.themeState,
				});

				try {
					const result = await terminal.createOrAttach({
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
						allowKilled,
						themeType: resolvedThemeType,
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
					const isKilledError =
						error instanceof TerminalKilledError ||
						(error instanceof Error &&
							error.message === TERMINAL_SESSION_KILLED_MESSAGE);
					if (isKilledError) {
						if (DEBUG_TERMINAL) {
							console.warn(
								"[Terminal Router] createOrAttach blocked (killed):",
								{
									paneId,
									workspaceId,
								},
							);
						}
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: TERMINAL_SESSION_KILLED_MESSAGE,
						});
					}
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
					terminal.write(input);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Write failed";

					// Emit exit instead of error for deleted sessions to prevent toast floods
					if (message.includes("not found or not alive")) {
						terminal.emit(`exit:${input.paneId}`, 0, 15);
						return;
					}

					terminal.emit(`error:${input.paneId}`, {
						error: message,
						code: "WRITE_FAILED",
					});
				}
			}),

		ackColdRestore: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
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
				terminal.signal(input);
			}),

		kill: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminal.kill(input);
			}),

		detach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminal.detach(input);
			}),

		clearScrollback: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminal.clearScrollback(input);
			}),

		listDaemonSessions: publicProcedure.query(async () => {
			const { sessions } = await terminal.management.listSessions();
			return { sessions };
		}),

		killAllDaemonSessions: publicProcedure.mutation(async () => {
			const client = getTerminalHostClient();
			const before = await terminal.management.listSessions();
			const beforeIds = before.sessions.map((s) => s.sessionId);
			console.log(
				"[killAllDaemonSessions] Before kill:",
				beforeIds.length,
				"sessions",
				beforeIds,
			);

			if (beforeIds.length > 0) {
				const results = await Promise.allSettled(
					beforeIds.map((paneId) => terminal.kill({ paneId })),
				);
				for (const [index, result] of results.entries()) {
					if (result.status === "rejected") {
						const paneId = beforeIds[index];
						logger.error(
							`[killAllDaemonSessions] terminal.kill failed for paneId=${paneId}`,
							{
								paneId,
								reason: result.reason,
							},
						);
					}
				}
			}

			// Poll until sessions are actually dead
			const MAX_RETRIES = 10;
			const RETRY_DELAY_MS = 100;
			let remainingCount = before.sessions.length;
			let afterIds: string[] = [];

			for (let i = 0; i < MAX_RETRIES && remainingCount > 0; i++) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
				const after = await client.listSessions();
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

			return { killedCount, remainingCount };
		}),

		killDaemonSessionsForWorkspace: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const { sessions } = await terminal.management.listSessions();
				const toKill = sessions.filter(
					(session) => session.workspaceId === input.workspaceId,
				);

				if (toKill.length > 0) {
					const paneIds = toKill.map((session) => session.sessionId);
					const results = await Promise.allSettled(
						paneIds.map((paneId) => terminal.kill({ paneId })),
					);
					for (const [index, result] of results.entries()) {
						if (result.status === "rejected") {
							const paneId = paneIds[index];
							logger.error(
								`[killDaemonSessionsForWorkspace] terminal.kill failed for paneId=${paneId}`,
								{
									paneId,
									workspaceId: input.workspaceId,
									reason: result.reason,
								},
							);
						}
					}
				}

				return { killedCount: toKill.length };
			}),

		clearTerminalHistory: publicProcedure.mutation(async () => {
			await terminal.management.resetHistoryPersistence();
			return { success: true };
		}),

		/** Restart daemon to recover from stuck state. Kills all sessions. */
		restartDaemon: publicProcedure.mutation(async () => {
			return restartDaemonShared();
		}),

		getSession: publicProcedure
			.input(z.string())
			.query(async ({ input: paneId }) => {
				return terminal.getSession(paneId);
			}),

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

		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: paneId }) => {
				return observable<
					| { type: "data"; data: string }
					| {
							type: "exit";
							exitCode: number;
							signal?: number;
							reason?: "killed" | "exited" | "error";
					  }
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

					const onExit = (
						exitCode: number,
						signal?: number,
						reason?: "killed" | "exited" | "error",
					) => {
						// Don't emit.complete() - paneId is reused across restarts, completion would strand listeners
						emit.next({ type: "exit", exitCode, signal, reason });
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
