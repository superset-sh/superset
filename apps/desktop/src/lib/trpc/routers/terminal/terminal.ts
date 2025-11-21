import { observable } from "@trpc/server/observable";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Terminal router using TerminalManager with node-pty
 * Sessions are keyed by tabId and linked to workspaces for cwd resolution
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

				const result = await terminalManager.createOrAttach({
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
