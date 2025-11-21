import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Terminal router with mocked implementations
 * TODO: Replace with actual terminal IPC implementation
 */
export const createTerminalRouter = () => {
	// Mock terminal sessions storage
	const terminalSessions = new Map<string, string>();

	return router({
		create: publicProcedure
			.input(
				z.object({
					id: z.string().optional(),
					cols: z.number().optional(),
					rows: z.number().optional(),
					cwd: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const terminalId = input.id || `terminal-${Date.now()}`;

				// Mock: Initialize empty session
				terminalSessions.set(terminalId, "");

				console.log(`[Terminal] Created terminal: ${terminalId}`, {
					cwd: input.cwd,
					cols: input.cols,
					rows: input.rows,
				});

				return terminalId;
			}),

		getHistory: publicProcedure
			.input(z.string())
			.query(async ({ input: terminalId }) => {
				// Mock: Return undefined for new terminals (triggers welcome message)
				const history = terminalSessions.get(terminalId);

				console.log(`[Terminal] Get history for: ${terminalId}`, {
					hasHistory: !!history,
				});

				return history || undefined;
			}),

		executeCommand: publicProcedure
			.input(
				z.object({
					id: z.string(),
					command: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log(`[Terminal] Execute command on ${input.id}:`, input.command);

				// Mock: Store command in history
				const currentHistory = terminalSessions.get(input.id) || "";
				terminalSessions.set(
					input.id,
					`${currentHistory}$ ${input.command}\r\n[MOCK] Command not yet implemented\r\n`,
				);
			}),

		resize: publicProcedure
			.input(
				z.object({
					id: z.string(),
					cols: z.number(),
					rows: z.number(),
					seq: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log(`[Terminal] Resize ${input.id}:`, {
					cols: input.cols,
					rows: input.rows,
					seq: input.seq,
				});
			}),

		signal: publicProcedure
			.input(
				z.object({
					id: z.string(),
					signal: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log(`[Terminal] Signal ${input.id}:`, input.signal);
			}),

		detach: publicProcedure
			.input(z.string())
			.mutation(async ({ input: terminalId }) => {
				console.log(`[Terminal] Detach: ${terminalId}`);
				// Mock: Keep session in memory for reconnection
			}),

		scrollLines: publicProcedure
			.input(
				z.object({
					id: z.string(),
					amount: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				console.log(`[Terminal] Scroll ${input.id} by ${input.amount} lines`);
			}),
	});
};
