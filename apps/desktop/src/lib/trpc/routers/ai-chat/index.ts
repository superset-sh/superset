import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	readClaudeSessionMessages,
	scanClaudeSessions,
} from "./utils/claude-session-scanner";
import {
	type ClaudeStreamEvent,
	chatSessionManager,
	sessionStore,
} from "./utils/session-manager";

const CLAUDE_AGENT_URL =
	process.env.CLAUDE_AGENT_URL || "http://localhost:9090";

interface CommandEntry {
	name: string;
	description: string;
	argumentHint: string;
}

function scanCustomCommands(cwd: string): CommandEntry[] {
	const dirs = [
		join(cwd, ".claude", "commands"),
		join(homedir(), ".claude", "commands"),
	];
	const commands: CommandEntry[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const name = file.replace(/\.md$/, "");
				if (seen.has(name)) continue;
				seen.add(name);
				const raw = readFileSync(join(dir, file), "utf-8");
				const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
				const descMatch = fmMatch?.[1]?.match(/^description:\s*(.+)$/m);
				const argMatch = fmMatch?.[1]?.match(/^argument-hint:\s*(.+)$/m);
				commands.push({
					name,
					description: descMatch?.[1]?.trim() ?? "",
					argumentHint: argMatch?.[1]?.trim() ?? "",
				});
			}
		} catch {}
	}

	return commands;
}

export const createAiChatRouter = () => {
	return router({
		getConfig: publicProcedure.query(() => ({
			proxyUrl: process.env.DURABLE_STREAM_URL || "http://localhost:8080",
			authToken:
				process.env.DURABLE_STREAM_AUTH_TOKEN ||
				process.env.DURABLE_STREAM_TOKEN ||
				null,
		})),

		getSlashCommands: publicProcedure
			.input(z.object({ cwd: z.string() }))
			.query(async ({ input }) => {
				const customCommands = scanCustomCommands(input.cwd);

				let sdkCommands: CommandEntry[] = [];
				try {
					const res = await fetch(`${CLAUDE_AGENT_URL}/commands`);
					if (res.ok) {
						const data = (await res.json()) as {
							commands: CommandEntry[];
						};
						sdkCommands = data.commands ?? [];
					}
				} catch {}

				const seen = new Set(sdkCommands.map((c) => c.name));
				return {
					commands: [
						...sdkCommands,
						...customCommands.filter((c) => !seen.has(c.name)),
					],
				};
			}),

		startSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					workspaceId: z.string(),
					cwd: z.string(),
					paneId: z.string().optional(),
					tabId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.startSession({
					sessionId: input.sessionId,
					workspaceId: input.workspaceId,
					cwd: input.cwd,
					paneId: input.paneId,
					tabId: input.tabId,
				});
				return { success: true };
			}),

		restoreSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					cwd: z.string(),
					paneId: z.string().optional(),
					tabId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.restoreSession({
					sessionId: input.sessionId,
					cwd: input.cwd,
					paneId: input.paneId,
					tabId: input.tabId,
				});
				return { success: true };
			}),

		interrupt: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await chatSessionManager.interrupt({
					sessionId: input.sessionId,
				});
				return { success: true };
			}),

		stopSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await chatSessionManager.deactivateSession({
					sessionId: input.sessionId,
				});
				return { success: true };
			}),

		deleteSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await chatSessionManager.deleteSession({
					sessionId: input.sessionId,
				});
				return { success: true };
			}),

		updateSessionConfig: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					maxThinkingTokens: z.number().nullable().optional(),
					model: z.string().nullable().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.updateAgentConfig({
					sessionId: input.sessionId,
					maxThinkingTokens: input.maxThinkingTokens,
					model: input.model,
				});
				return { success: true };
			}),

		renameSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					title: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.updateSessionMeta(input.sessionId, {
					title: input.title,
				});
				return { success: true };
			}),

		listSessions: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				return sessionStore.listByWorkspace(input.workspaceId);
			}),

		getSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(async ({ input }) => {
				return (await sessionStore.get(input.sessionId)) ?? null;
			}),

		isSessionActive: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(({ input }) => {
				return chatSessionManager.isSessionActive(input.sessionId);
			}),

		getActiveSessions: publicProcedure.query(() => {
			return chatSessionManager.getActiveSessions();
		}),

		getClaudeSessionMessages: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(async ({ input }) => {
				return readClaudeSessionMessages({ sessionId: input.sessionId });
			}),

		scanClaudeSessions: publicProcedure
			.input(
				z
					.object({
						cursor: z.number().optional(),
						limit: z.number().min(1).max(100).optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return scanClaudeSessions({
					cursor: input?.cursor ?? 0,
					limit: input?.limit ?? 30,
				});
			}),

		streamEvents: publicProcedure
			.input(z.object({ sessionId: z.string().optional() }))
			.subscription(({ input }) => {
				return observable<ClaudeStreamEvent>((emit) => {
					const onEvent = (event: ClaudeStreamEvent) => {
						if (input.sessionId && event.sessionId !== input.sessionId) {
							return;
						}
						emit.next(event);
					};

					chatSessionManager.on("event", onEvent);

					return () => {
						chatSessionManager.off("event", onEvent);
					};
				});
			}),
	});
};
