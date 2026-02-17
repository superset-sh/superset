import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	memory,
	setAnthropicAuthToken,
	toAISdkV5Messages,
} from "@superset/agent";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "./utils/auth/auth";
import {
	readClaudeSessionMessages,
	scanClaudeSessions,
} from "./utils/claude-session-scanner";
import { getAvailableModels } from "./utils/models";
import {
	sessionAbortControllers,
	sessionContext,
	sessionRunIds,
} from "./utils/run-agent";
import { StreamWatcher } from "./utils/stream-watcher";

const cliCredentials =
	getCredentialsFromConfig() ?? getCredentialsFromKeychain();
if (cliCredentials?.kind === "oauth") {
	setAnthropicAuthToken(cliCredentials.apiKey);
	console.log(
		`[ai-chat] Using Claude OAuth credentials from ${cliCredentials.source} (Bearer auth)`,
	);
} else if (cliCredentials) {
	console.warn(
		`[ai-chat] Ignoring non-OAuth credentials from ${cliCredentials.source} — only OAuth is supported`,
	);
}

interface CommandEntry {
	name: string;
	description: string;
	argumentHint: string;
}

const permissionModeSchema = z.enum([
	"default",
	"acceptEdits",
	"bypassPermissions",
]);

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
		} catch (err) {
			console.warn(
				`[ai-chat/scanCustomCommands] Failed to read commands from ${dir}:`,
				err,
			);
		}
	}

	return commands;
}

// ---------------------------------------------------------------------------
// StreamWatcher instances — one per active session
// ---------------------------------------------------------------------------

const streamWatchers = new Map<string, StreamWatcher>();

export const createAiChatRouter = () => {
	return router({
		getConfig: publicProcedure.query(() => ({
			apiUrl: env.NEXT_PUBLIC_API_URL,
		})),

		getModels: publicProcedure.query(() => getAvailableModels()),

		getMessages: publicProcedure
			.input(z.object({ threadId: z.string() }))
			.query(async ({ input }) => {
				const result = await memory.recall({
					threadId: input.threadId,
				});
				return toAISdkV5Messages(result.messages);
			}),

		getSlashCommands: publicProcedure
			.input(z.object({ cwd: z.string() }))
			.query(({ input }) => {
				return { commands: scanCustomCommands(input.cwd) };
			}),

		// TODO: session listing will move to server-side (Postgres) storage
		listSessions: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async () => {
				return [] as Array<{
					sessionId: string;
					title: string;
					lastActiveAt: number;
					messagePreview?: string;
				}>;
			}),

		deleteSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(({ input }) => {
				// Stop StreamWatcher
				const watcher = streamWatchers.get(input.sessionId);
				if (watcher) {
					watcher.stop();
					streamWatchers.delete(input.sessionId);
				}

				// Abort any running agent
				const controller = sessionAbortControllers.get(input.sessionId);
				if (controller) controller.abort();
				sessionAbortControllers.delete(input.sessionId);
				sessionRunIds.delete(input.sessionId);
				sessionContext.delete(input.sessionId);
				return { success: true };
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

		// ---------------------------------------------------------------
		// Session registration — renderer calls on mount
		// Creates a StreamWatcher that monitors the durable stream for
		// new user messages from any client and triggers the agent.
		// ---------------------------------------------------------------
		registerSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					cwd: z.string(),
					modelId: z.string(),
					permissionMode: permissionModeSchema.optional(),
					thinkingEnabled: z.boolean().optional(),
				}),
			)
			.mutation(({ input }) => {
				// Stop existing watcher if re-registering
				const existing = streamWatchers.get(input.sessionId);
				if (existing) existing.stop();

				const watcher = new StreamWatcher({
					sessionId: input.sessionId,
					config: {
						cwd: input.cwd,
						modelId: input.modelId,
						permissionMode: input.permissionMode,
						thinkingEnabled: input.thinkingEnabled,
					},
				});
				watcher.start();
				streamWatchers.set(input.sessionId, watcher);

				return { success: true };
			}),

		// ---------------------------------------------------------------
		// Config updates — renderer calls when user changes model etc.
		// ---------------------------------------------------------------
		updateSessionConfig: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					cwd: z.string().optional(),
					modelId: z.string().optional(),
					permissionMode: permissionModeSchema.optional(),
					thinkingEnabled: z.boolean().optional(),
				}),
			)
			.mutation(({ input }) => {
				const watcher = streamWatchers.get(input.sessionId);
				if (!watcher) {
					return { success: false, error: "No watcher for session" };
				}
				watcher.updateConfig({
					cwd: input.cwd,
					modelId: input.modelId,
					permissionMode: input.permissionMode,
					thinkingEnabled: input.thinkingEnabled,
				});
				return { success: true };
			}),

		// ---------------------------------------------------------------
		// Abort — stops running agent for a session
		// ---------------------------------------------------------------
		abortSuperagent: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(({ input }) => {
				const controller = sessionAbortControllers.get(input.sessionId);
				if (controller) {
					controller.abort();
					return { success: true, aborted: true };
				}
				return { success: true, aborted: false };
			}),
	});
};
