import { observable } from "@trpc/server/observable";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorktreePath } from "../workspaces/utils/worktree";
import { resolveCwd } from "./utils";

/**
 * Terminal router using TerminalManager with node-pty
 * Sessions are keyed by tabId and linked to workspaces for cwd resolution
 *
 * Environment variables set for terminal sessions:
 * - PATH: Prepends ~/.superset/bin so wrapper scripts intercept agent commands
 * - SUPERSET_PANE_ID: The pane ID (used by notification hooks)
 * - SUPERSET_WORKSPACE_ID: The workspace ID (used by notification hooks)
 * - SUPERSET_PORT: The hooks server port for agent completion notifications
 */
export const createTerminalRouter = () => {
	return router({
		createOrAttach: publicProcedure
			.input(
				z.object({
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

				const result = await terminalManager.createOrAttach({
					tabId,
					workspaceId,
					cwd,
					cols,
					rows,
					initialCommands,
				});

				return {
					tabId,
					isNew: result.isNew,
					scrollback: result.scrollback,
					wasRecovered: result.wasRecovered,
				};
			}),

		write: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					data: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.write(input);
			}),

		resize: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
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
					tabId: z.string(),
					signal: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.signal(input);
			}),

		kill: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
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
					tabId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.detach(input);
			}),

		getSession: publicProcedure
			.input(z.string())
			.query(async ({ input: tabId }) => {
				return terminalManager.getSession(tabId);
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
			.subscription(({ input: tabId }) => {
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

					terminalManager.on(`data:${tabId}`, onData);
					terminalManager.on(`exit:${tabId}`, onExit);

					// Cleanup on unsubscribe
					return () => {
						terminalManager.off(`data:${tabId}`, onData);
						terminalManager.off(`exit:${tabId}`, onExit);
					};
				});
			}),
	});
};
