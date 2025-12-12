import { observable } from "@trpc/server/observable";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorktreePath } from "../workspaces/utils/worktree";
import { resolveCwd } from "./utils";

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
				}),
			)
			.mutation(async ({ input }) => {
				const {
					paneId,
					tabId,
					workspaceId,
					cols,
					rows,
					cwd: cwdOverride,
					initialCommands,
				} = input;

				// Resolve cwd: absolute paths stay as-is, relative paths resolve against worktree
				const workspace = db.data.workspaces.find((w) => w.id === workspaceId);
				const worktreePath = workspace
					? getWorktreePath(workspace.worktreeId)
					: undefined;
				const cwd = resolveCwd(cwdOverride, worktreePath);

				// Get project info for environment variables
				const project = workspace
					? db.data.projects.find((p) => p.id === workspace.projectId)
					: undefined;

				const result = await terminalManager.createOrAttach({
					paneId,
					tabId,
					workspaceId,
					workspaceName: workspace?.name,
					workspacePath: worktreePath,
					rootPath: project?.mainRepoPath,
					cwd,
					cols,
					rows,
					initialCommands,
				});

				return {
					paneId,
					isNew: result.isNew,
					scrollback: result.scrollback,
					wasRecovered: result.wasRecovered,
				};
			}),

		write: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					data: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.write(input);
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
					deleteHistory: z.boolean().optional(),
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
			.query(async ({ input: workspaceId }) => {
				const workspace = db.data.workspaces.find((w) => w.id === workspaceId);
				if (!workspace) {
					return undefined;
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				return worktree?.path;
			}),

		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: paneId }) => {
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number; signal?: number }
				>((emit) => {
					const onData = (data: string) => {
						emit.next({ type: "data", data });
					};

					const onExit = (exitCode: number, signal?: number) => {
						emit.next({ type: "exit", exitCode, signal });
						emit.complete();
					};

					terminalManager.on(`data:${paneId}`, onData);
					terminalManager.on(`exit:${paneId}`, onExit);

					// Cleanup on unsubscribe
					return () => {
						terminalManager.off(`data:${paneId}`, onData);
						terminalManager.off(`exit:${paneId}`, onExit);
					};
				});
			}),
	});
};
