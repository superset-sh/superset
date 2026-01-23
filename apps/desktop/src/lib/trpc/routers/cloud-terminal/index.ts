import { observable } from "@trpc/server/observable";
import { sshManager } from "main/lib/ssh-terminal";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const DEBUG_CLOUD_TERMINAL = process.env.SUPERSET_SSH_DEBUG === "1";

/**
 * Cloud Terminal Router - manages SSH connections to cloud workspaces
 *
 * This router handles:
 * - Creating SSH sessions to cloud VMs
 * - Writing data to SSH sessions
 * - Resizing terminals
 * - Streaming terminal output
 */
export const createCloudTerminalRouter = () => {
	return router({
		/**
		 * Create a new SSH session to a cloud workspace
		 */
		createSession: publicProcedure
			.input(
				z.object({
					paneId: z.string().min(1),
					cloudWorkspaceId: z.string().uuid(),
					credentials: z.object({
						host: z.string(),
						port: z.number(),
						username: z.string(),
						token: z.string().optional(),
					}),
					cols: z.number().optional(),
					rows: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { paneId, cloudWorkspaceId, credentials, cols, rows } = input;

				if (DEBUG_CLOUD_TERMINAL) {
					console.log("[CloudTerminal] Creating session:", {
						paneId,
						cloudWorkspaceId,
						host: credentials.host,
					});
				}

				const result = await sshManager.createSession({
					paneId,
					cloudWorkspaceId,
					credentials,
					cols,
					rows,
				});

				return result;
			}),

		/**
		 * Write data to SSH session
		 */
		write: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					data: z.string(),
				}),
			)
			.mutation(({ input }) => {
				try {
					sshManager.write(input);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Write failed";

					if (message.includes("not found or not alive")) {
						sshManager.emit(`exit:${input.paneId}`, 0, 15);
						return;
					}

					sshManager.emit(`error:${input.paneId}`, {
						error: message,
						code: "WRITE_FAILED",
					});
				}
			}),

		/**
		 * Resize SSH terminal
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
				sshManager.resize(input);
			}),

		/**
		 * Kill SSH session
		 */
		kill: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await sshManager.kill(input);
			}),

		/**
		 * Get SSH session info
		 */
		getSession: publicProcedure.input(z.string()).query(({ input: paneId }) => {
			return sshManager.getSession(paneId);
		}),

		/**
		 * Kill all sessions for a cloud workspace
		 */
		killByCloudWorkspace: publicProcedure
			.input(z.object({ cloudWorkspaceId: z.string().uuid() }))
			.mutation(async ({ input }) => {
				return sshManager.killByCloudWorkspaceId(input.cloudWorkspaceId);
			}),

		/**
		 * Stream SSH terminal output
		 */
		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: paneId }) => {
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number; signal?: number }
					| { type: "error"; error: string; code?: string }
				>((emit) => {
					if (DEBUG_CLOUD_TERMINAL) {
						console.log(`[CloudTerminal Stream] Subscribe: ${paneId}`);
					}

					const onData = (data: string) => {
						emit.next({ type: "data", data });
					};

					const onExit = (exitCode: number, signal?: number) => {
						emit.next({ type: "exit", exitCode, signal });
					};

					const onError = (payload: { error: string; code?: string }) => {
						emit.next({
							type: "error",
							error: payload.error,
							code: payload.code,
						});
					};

					sshManager.on(`data:${paneId}`, onData);
					sshManager.on(`exit:${paneId}`, onExit);
					sshManager.on(`error:${paneId}`, onError);

					return () => {
						if (DEBUG_CLOUD_TERMINAL) {
							console.log(`[CloudTerminal Stream] Unsubscribe: ${paneId}`);
						}
						sshManager.off(`data:${paneId}`, onData);
						sshManager.off(`exit:${paneId}`, onExit);
						sshManager.off(`error:${paneId}`, onError);
					};
				});
			}),
	});
};
