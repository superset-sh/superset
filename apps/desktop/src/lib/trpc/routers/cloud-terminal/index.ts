import { cloudWorkspaces } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { cloudTerminalManager } from "main/lib/cloud-terminal";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Cloud Terminal router for managing remote terminal sessions on cloud workspaces
 *
 * Uses the Freestyle SDK to connect to cloud VMs and establish WebSocket-based
 * terminal sessions. Sessions are keyed by paneId and linked to cloud workspaces.
 */
export const createCloudTerminalRouter = () => {
	return router({
		/**
		 * Create or attach to a cloud terminal session
		 */
		createOrAttach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					tabId: z.string(),
					cloudWorkspaceId: z.string(),
					cols: z.number().optional(),
					rows: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { paneId, tabId, cloudWorkspaceId, cols, rows } = input;

				// Get cloud workspace to find the VM ID
				const cloudWorkspace = localDb
					.select()
					.from(cloudWorkspaces)
					.where(eq(cloudWorkspaces.id, cloudWorkspaceId))
					.get();

				if (!cloudWorkspace) {
					throw new Error(`Cloud workspace ${cloudWorkspaceId} not found`);
				}

				if (!cloudWorkspace.provider_vm_id) {
					throw new Error(
						`Cloud workspace ${cloudWorkspaceId} does not have a VM assigned`,
					);
				}

				if (cloudWorkspace.status !== "running") {
					throw new Error(
						`Cloud workspace ${cloudWorkspaceId} is not running (status: ${cloudWorkspace.status})`,
					);
				}

				const result = await cloudTerminalManager.createOrAttach({
					paneId,
					tabId,
					cloudWorkspaceId,
					vmId: cloudWorkspace.provider_vm_id,
					cols,
					rows,
				});

				return {
					paneId,
					isNew: result.isNew,
					scrollback: result.scrollback,
					wasRecovered: result.wasRecovered,
					viewportY: result.viewportY,
				};
			}),

		/**
		 * Write data to cloud terminal
		 */
		write: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					data: z.string(),
				}),
			)
			.mutation(({ input }) => {
				cloudTerminalManager.write(input);
			}),

		/**
		 * Resize cloud terminal
		 */
		resize: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					cols: z.number(),
					rows: z.number(),
				}),
			)
			.mutation(({ input }) => {
				cloudTerminalManager.resize(input);
			}),

		/**
		 * Kill cloud terminal session
		 */
		kill: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await cloudTerminalManager.kill(input);
			}),

		/**
		 * Detach from cloud terminal (keep session alive)
		 */
		detach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					viewportY: z.number().optional(),
				}),
			)
			.mutation(({ input }) => {
				cloudTerminalManager.detach(input);
			}),

		/**
		 * Clear scrollback buffer for cloud terminal
		 */
		clearScrollback: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(({ input }) => {
				cloudTerminalManager.clearScrollback(input);
			}),

		/**
		 * Get cloud terminal session info
		 */
		getSession: publicProcedure
			.input(z.string())
			.query(({ input: paneId }) => {
				return cloudTerminalManager.getSession(paneId);
			}),

		/**
		 * Stream data from cloud terminal
		 */
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

					cloudTerminalManager.on(`data:${paneId}`, onData);
					cloudTerminalManager.on(`exit:${paneId}`, onExit);

					// Cleanup on unsubscribe
					return () => {
						cloudTerminalManager.off(`data:${paneId}`, onData);
						cloudTerminalManager.off(`exit:${paneId}`, onExit);
					};
				});
			}),
	});
};
