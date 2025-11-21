import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal-manager";
import { publicProcedure, router } from "../..";

/**
 * Terminal router using TerminalManager with node-pty
 * Sessions are keyed by tabId and linked to workspaces for cwd resolution
 */
export const createTerminalRouter = () => {
	return router({
		/**
		 * Create or attach to an existing terminal session
		 * Returns scrollback history if reattaching to an existing session
		 */
		createOrAttach: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					workspaceId: z.string(),
					cols: z.number().optional(),
					rows: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { tabId, workspaceId, cols, rows } = input;

				// Get workspace to determine cwd from worktree path
				const workspace = db.data.workspaces.find((w) => w.id === workspaceId);
				let cwd: string | undefined;

				if (workspace) {
					const worktree = db.data.worktrees.find(
						(wt) => wt.id === workspace.worktreeId,
					);
					if (worktree) {
						cwd = worktree.path;
					}
				}

				const result = terminalManager.createOrAttach({
					tabId,
					workspaceId,
					cwd,
					cols,
					rows,
				});

				return {
					tabId,
					isNew: result.isNew,
					scrollback: result.scrollback,
				};
			}),

		/**
		 * Write data to the terminal (user input)
		 */
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

		/**
		 * Resize the terminal
		 */
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

		/**
		 * Send signal to terminal process
		 */
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

		/**
		 * Kill the terminal session
		 */
		kill: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.kill(input);
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

		/**
		 * Get terminal session metadata
		 */
		getSession: publicProcedure
			.input(z.string())
			.query(async ({ input: tabId }) => {
				return terminalManager.getSession(tabId);
			}),

		/**
		 * Subscribe to terminal output stream
		 * Emits data and exit events
		 */
		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: tabId }) => {
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number; signal?: number }
				>((emit) => {
					// Handler for terminal data
					const onData = (data: string) => {
						emit.next({ type: "data", data });
					};

					// Handler for terminal exit
					const onExit = (exitCode: number, signal?: number) => {
						emit.next({ type: "exit", exitCode, signal });
						emit.complete();
					};

					// Register event listeners
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
