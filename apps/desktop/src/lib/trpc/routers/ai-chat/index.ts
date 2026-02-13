import { execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
	memory,
	PROVIDER_REGISTRY,
	RequestContext,
	superagent,
	toAISdkV5Messages,
} from "@superset/agent";
import { observable } from "@trpc/server/observable";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";
import {
	readClaudeSessionMessages,
	scanClaudeSessions,
} from "./utils/claude-session-scanner";
import { chatSessionManager, sessionStore } from "./utils/session-manager";

/** Per-session event bus for streaming superagent chunks to the renderer */
const superagentEmitter = new EventEmitter();
superagentEmitter.setMaxListeners(50);

/** Per-session AbortController for cancelling running streams */
const sessionAbortControllers = new Map<string, AbortController>();

/** Per-session runId for tool approval (maps sessionId → runId) */
const sessionRunIds = new Map<string, string>();

/** Per-session context needed for approval resumption (maps sessionId → { cwd, modelId }) */
const sessionContext = new Map<string, { cwd: string; modelId: string }>();

/** Track whether a session stream is suspended (waiting for tool approval) */
const sessionSuspended = new Set<string>();

// ---------------------------------------------------------------------------
// Auto-Context: gather project intelligence on each turn
// ---------------------------------------------------------------------------

function safeReadFile(path: string, maxBytes = 8_000): string | null {
	try {
		if (!existsSync(path)) return null;
		const stat = statSync(path);
		if (!stat.isFile() || stat.size > maxBytes) return null;
		return readFileSync(path, "utf-8");
	} catch {
		return null;
	}
}

function safeExec(cmd: string, cwd: string, timeoutMs = 3_000): string {
	try {
		return execSync(cmd, { cwd, timeout: timeoutMs, encoding: "utf-8" }).trim();
	} catch {
		return "";
	}
}

/** Build a shallow file tree (2 levels) for project awareness */
function buildFileTree(cwd: string, maxDepth = 2, prefix = ""): string[] {
	const lines: string[] = [];
	try {
		const entries = readdirSync(cwd, { withFileTypes: true })
			.filter(
				(e) =>
					!e.name.startsWith(".") &&
					e.name !== "node_modules" &&
					e.name !== "dist" &&
					e.name !== "build",
			)
			.sort((a, b) => {
				// Directories first
				if (a.isDirectory() && !b.isDirectory()) return -1;
				if (!a.isDirectory() && b.isDirectory()) return 1;
				return a.name.localeCompare(b.name);
			})
			.slice(0, 40); // cap to avoid huge listings

		for (const entry of entries) {
			const isDir = entry.isDirectory();
			lines.push(`${prefix}${isDir ? `${entry.name}/` : entry.name}`);
			if (isDir && maxDepth > 1) {
				lines.push(
					...buildFileTree(join(cwd, entry.name), maxDepth - 1, `${prefix}  `),
				);
			}
		}
	} catch {
		// permission error, etc.
	}
	return lines;
}

/**
 * Gather all project context for a given workspace directory.
 * Returns a formatted string to inject as additional instructions.
 */
function gatherProjectContext(cwd: string): string {
	const sections: string[] = [];

	// 1. Project conventions (AGENTS.md, CLAUDE.md, .cursorrules)
	const conventionFiles = [
		"AGENTS.md",
		"CLAUDE.md",
		".claude/CLAUDE.md",
		".cursorrules",
	];
	for (const file of conventionFiles) {
		const content = safeReadFile(join(cwd, file));
		if (content) {
			sections.push(
				`<project-conventions file="${file}">\n${content}\n</project-conventions>`,
			);
		}
	}

	// 2. Package.json summary
	const pkgContent = safeReadFile(join(cwd, "package.json"));
	if (pkgContent) {
		try {
			const pkg = JSON.parse(pkgContent);
			const summary = {
				name: pkg.name,
				description: pkg.description,
				scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
				dependencies: pkg.dependencies
					? Object.keys(pkg.dependencies).length
					: 0,
				devDependencies: pkg.devDependencies
					? Object.keys(pkg.devDependencies).length
					: 0,
			};
			sections.push(
				`<package-info>\n${JSON.stringify(summary, null, 2)}\n</package-info>`,
			);
		} catch {
			// malformed package.json
		}
	}

	// 3. File tree (2 levels)
	const tree = buildFileTree(cwd);
	if (tree.length > 0) {
		sections.push(
			`<file-tree root="${basename(cwd)}">\n${tree.join("\n")}\n</file-tree>`,
		);
	}

	// 4. Git state
	const gitBranch = safeExec("git branch --show-current", cwd);
	if (gitBranch) {
		const gitStatus = safeExec("git status --short", cwd);
		const gitLog = safeExec("git log --oneline -5 --no-decorate", cwd);
		const gitParts = [`Branch: ${gitBranch}`];
		if (gitStatus) gitParts.push(`Dirty files:\n${gitStatus}`);
		if (gitLog) gitParts.push(`Recent commits:\n${gitLog}`);
		sections.push(`<git-state>\n${gitParts.join("\n")}\n</git-state>`);
	}

	if (sections.length === 0) return "";

	return `\n\n# Project context (auto-injected)\n\nThe following is automatically gathered context about the current project workspace at \`${cwd}\`. Use this to understand the project without needing to explore from scratch.\n\n${sections.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// File mentions: parse @filepath patterns from the user message
// ---------------------------------------------------------------------------

interface FileMention {
	/** The original @path text in the message */
	raw: string;
	/** Absolute path to the file */
	absPath: string;
	/** Relative path used in the mention */
	relPath: string;
	/** File contents (null if unreadable) */
	content: string | null;
}

function parseFileMentions(text: string, cwd: string): FileMention[] {
	// Match @some/path/to/file.ext patterns (must have at least one / or . to avoid false positives)
	const mentionRegex = /@([\w./-]+(?:\/[\w./-]+|\.[\w]+))/g;
	const mentions: FileMention[] = [];
	const seen = new Set<string>();

	let match: RegExpExecArray | null;
	while ((match = mentionRegex.exec(text)) !== null) {
		const relPath = match[1];
		if (seen.has(relPath)) continue;
		seen.add(relPath);

		const absPath = join(cwd, relPath);
		const content = safeReadFile(absPath, 50_000); // allow larger files for explicit mentions
		mentions.push({
			raw: match[0],
			absPath,
			relPath,
			content,
		});
	}

	return mentions;
}

function buildFileMentionContext(mentions: FileMention[]): string {
	if (mentions.length === 0) return "";

	const parts = mentions
		.filter((m) => m.content !== null)
		.map((m) => `<file path="${m.relPath}">\n${m.content}\n</file>`);

	if (parts.length === 0) return "";
	return `\n\nThe user referenced the following files. Their contents are provided below:\n\n${parts.join("\n\n")}`;
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

export const createAiChatRouter = () => {
	return router({
		getConfig: publicProcedure.query(async () => {
			const { token } = await loadToken();
			return {
				proxyUrl: env.NEXT_PUBLIC_STREAMS_URL,
				authToken: token,
			};
		}),

		getModels: publicProcedure.query(() => {
			return Object.entries(PROVIDER_REGISTRY).flatMap(
				([providerId, config]: [string, { name: string; models: string[] }]) =>
					config.models.map((modelId: string) => ({
						id: `${providerId}/${modelId}`,
						name: modelId,
						provider: config.name,
					})),
			);
		}),

		getMessages: publicProcedure
			.input(z.object({ threadId: z.string() }))
			.query(async ({ input }) => {
				const result = await memory.recall({
					threadId: input.threadId,
				});
				// Convert Mastra DB messages → AI SDK V5 UIMessage format
				// This normalizes tool invocations with proper toolName, toolCallId, etc.
				const uiMessages = toAISdkV5Messages(result.messages);
				// Debug: log tool parts to verify shape
				for (const msg of uiMessages.slice(0, 3)) {
					const parts = (msg as Record<string, unknown>).parts as
						| Array<Record<string, unknown>>
						| undefined;
					if (parts) {
						for (const p of parts) {
							if (String(p.type ?? "").startsWith("tool-")) {
								console.log(
									"[getMessages] V5 tool part keys:",
									Object.keys(p),
									"type:",
									p.type,
								);
								console.log(
									"[getMessages] V5 tool part:",
									JSON.stringify(p, null, 2).slice(0, 500),
								);
							}
						}
					}
				}
				return uiMessages;
			}),

		getSlashCommands: publicProcedure
			.input(z.object({ cwd: z.string() }))
			.query(({ input }) => {
				return { commands: scanCustomCommands(input.cwd) };
			}),

		startSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					workspaceId: z.string(),
					cwd: z.string(),
					paneId: z.string().optional(),
					tabId: z.string().optional(),
					model: z.string().optional(),
					permissionMode: permissionModeSchema.optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.startSession({
					sessionId: input.sessionId,
					workspaceId: input.workspaceId,
					cwd: input.cwd,
					paneId: input.paneId,
					tabId: input.tabId,
					model: input.model,
					permissionMode: input.permissionMode,
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
					model: z.string().optional(),
					permissionMode: permissionModeSchema.optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.restoreSession({
					sessionId: input.sessionId,
					cwd: input.cwd,
					paneId: input.paneId,
					tabId: input.tabId,
					model: input.model,
					permissionMode: input.permissionMode,
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
					permissionMode: permissionModeSchema.nullable().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.updateAgentConfig({
					sessionId: input.sessionId,
					maxThinkingTokens: input.maxThinkingTokens,
					model: input.model,
					permissionMode: input.permissionMode,
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
				await chatSessionManager.updateSessionMeta({
					sessionId: input.sessionId,
					patch: { title: input.title },
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

		sendMessage: publicProcedure
			.input(z.object({ sessionId: z.string(), text: z.string() }))
			.mutation(({ input }) => {
				console.log("sendMessage", input);
				// // Fire-and-forget: agent runs in background, errors surface via streamEvents
				// void chatSessionManager
				// 	.startAgent({
				// 		sessionId: input.sessionId,
				// 		prompt: input.text,
				// 	})
				// 	.catch((error: unknown) => {
				// 		console.error(
				// 			"[ai-chat/sendMessage] Failed to start agent:",
				// 			error,
				// 		);
				// 	});
				return { success: true };
			}),

		superagent: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					text: z.string(),
					modelId: z.string(),
					cwd: z.string(),
					permissionMode: permissionModeSchema.optional(),
				}),
			)
			.mutation(({ input }) => {
				console.log("[ai-chat/superagent] Received:", {
					sessionId: input.sessionId,
					text: input.text.slice(0, 50),
					modelId: input.modelId,
					cwd: input.cwd,
					permissionMode: input.permissionMode,
				});

				// Fire-and-forget: stream runs in background, chunks emitted to subscription
				void (async () => {
					// --- Abort controller ---
					const abortController = new AbortController();
					sessionAbortControllers.set(input.sessionId, abortController);

					// Store context for approval resumption
					sessionContext.set(input.sessionId, {
						cwd: input.cwd,
						modelId: input.modelId,
					});

					try {
						// --- Auto-context ---
						const projectContext = gatherProjectContext(input.cwd);

						// --- File mentions ---
						const mentions = parseFileMentions(input.text, input.cwd);
						const fileMentionContext = buildFileMentionContext(mentions);

						// Build the full context to inject as supplemental instructions
						const contextInstructions =
							projectContext + fileMentionContext || undefined;

						// --- Permission mode ---
						const requireToolApproval = input.permissionMode === "default"; // "Manual" mode: all tools need approval

						const reqCtx = new RequestContext([
							["modelId", input.modelId],
							["cwd", input.cwd],
						]);

						const output = await superagent.stream(input.text, {
							requestContext: reqCtx,
							maxSteps: 100,
							memory: {
								thread: input.sessionId,
								resource: input.sessionId,
							},
							abortSignal: abortController.signal,
							...(contextInstructions
								? { instructions: contextInstructions }
								: {}),
							...(requireToolApproval ? { requireToolApproval: true } : {}),
							onStepFinish: (event) => {
								// Emit token usage after each step
								const usage = (event as Record<string, unknown>).usage as
									| {
											promptTokens?: number;
											completionTokens?: number;
											totalTokens?: number;
									  }
									| undefined;
								if (usage) {
									superagentEmitter.emit(input.sessionId, {
										type: "chunk",
										chunk: {
											type: "usage",
											payload: usage,
										},
									});
								}
							},
						});

						// Store runId for approval flow
						const runId = output.runId;
						if (runId) {
							sessionRunIds.set(input.sessionId, runId);
							superagentEmitter.emit(input.sessionId, {
								type: "chunk",
								chunk: { type: "run-id", payload: { runId } },
							});
						}

						let chunkCount = 0;
						let suspended = false;
						const listenerCount = superagentEmitter.listenerCount(
							input.sessionId,
						);
						console.log(
							`[ai-chat/superagent] Starting stream. Listeners for "${input.sessionId}": ${listenerCount}`,
						);

						for await (const chunk of output.fullStream) {
							chunkCount++;
							const c = chunk as { type?: string };
							if (
								c.type?.startsWith("tool") ||
								c.type === "text-delta" ||
								c.type === "finish" ||
								c.type === "start" ||
								c.type === "step-start" ||
								c.type === "step-finish" ||
								chunkCount <= 5
							) {
								console.log(
									`[ai-chat/superagent] Chunk #${chunkCount}: type=${c.type}, listeners=${superagentEmitter.listenerCount(input.sessionId)}`,
								);
							}

							// Detect tool approval suspension
							if (c.type === "tool-call-approval") {
								suspended = true;
								sessionSuspended.add(input.sessionId);
								console.log(
									`[ai-chat/superagent] Tool approval required — stream suspended`,
								);
							}

							superagentEmitter.emit(input.sessionId, {
								type: "chunk",
								chunk,
							});
						}

						console.log(
							`[ai-chat/superagent] Stream complete. Total chunks: ${chunkCount}, suspended: ${suspended}`,
						);

						// Only emit "done" if the stream truly finished (not suspended for approval)
						if (!suspended) {
							superagentEmitter.emit(input.sessionId, {
								type: "done",
							});
							sessionRunIds.delete(input.sessionId);
							sessionContext.delete(input.sessionId);
						}
					} catch (error) {
						// Don't emit error for intentional aborts
						if (abortController.signal.aborted) {
							console.log("[ai-chat/superagent] Stream aborted by user.");
							superagentEmitter.emit(input.sessionId, {
								type: "done",
							});
							return;
						}
						console.error("[ai-chat/superagent] Stream failed:", error);
						superagentEmitter.emit(input.sessionId, {
							type: "error",
							error: error instanceof Error ? error.message : String(error),
						});
					} finally {
						sessionAbortControllers.delete(input.sessionId);
					}
				})();

				return { success: true };
			}),
		superagentStream: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.subscription(({ input }) => {
				return observable<
					| { type: "chunk"; chunk: unknown }
					| { type: "done" }
					| { type: "error"; error: string }
				>((emit) => {
					const handler = (
						event:
							| { type: "chunk"; chunk: unknown }
							| { type: "done" }
							| { type: "error"; error: string },
					) => {
						emit.next(event);
						// Don't complete the observable — keep it alive for the session lifetime.
						// This allows resumed streams (after tool approval) to continue emitting.
						// The frontend handles "done"/"error" by setting isStreaming=false.
					};
					superagentEmitter.on(input.sessionId, handler);
					return () => {
						superagentEmitter.off(input.sessionId, handler);
					};
				});
			}),

		/** Abort a running superagent stream */
		abortSuperagent: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(({ input }) => {
				const controller = sessionAbortControllers.get(input.sessionId);
				if (controller) {
					console.log(
						`[ai-chat/abortSuperagent] Aborting session ${input.sessionId}`,
					);
					controller.abort();
					sessionAbortControllers.delete(input.sessionId);
					return { success: true, aborted: true };
				}
				return { success: true, aborted: false };
			}),

		/** Approve or decline a tool call (Mastra native approval) */
		approveToolCall: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					runId: z.string(),
					approved: z.boolean(),
				}),
			)
			.mutation(({ input }) => {
				sessionSuspended.delete(input.sessionId);
				console.log(`[ai-chat/approveToolCall] Received:`, {
					sessionId: input.sessionId,
					runId: input.runId,
					approved: input.approved,
				});

				// Fire-and-forget: pipe the resumed stream back through the emitter
				void (async () => {
					try {
						// Restore the requestContext so dynamic workspace tools are available
						const ctx = sessionContext.get(input.sessionId);
						const reqCtx = ctx
							? new RequestContext([
									["modelId", ctx.modelId],
									["cwd", ctx.cwd],
								])
							: undefined;

						console.log(
							`[ai-chat/approveToolCall] Calling ${input.approved ? "approveToolCall" : "declineToolCall"} with runId: ${input.runId}, cwd: ${ctx?.cwd}`,
						);
						const approvalOpts = {
							runId: input.runId,
							...(reqCtx ? { requestContext: reqCtx } : {}),
						};
						const stream = input.approved
							? await superagent.approveToolCall(approvalOpts)
							: await superagent.declineToolCall(approvalOpts);

						let chunkCount = 0;
						console.log(
							`[ai-chat/approveToolCall] Got stream, starting to iterate. Listeners: ${superagentEmitter.listenerCount(input.sessionId)}`,
						);

						for await (const chunk of stream.fullStream) {
							chunkCount++;
							const c = chunk as { type?: string };

							// Check if the resumed stream itself hits another approval
							if (c.type === "tool-call-approval") {
								sessionSuspended.add(input.sessionId);
								console.log(
									`[ai-chat/approveToolCall] Another tool approval required`,
								);
							}

							superagentEmitter.emit(input.sessionId, {
								type: "chunk",
								chunk,
							});
						}

						console.log(
							`[ai-chat/approveToolCall] Resumed stream complete. Chunks: ${chunkCount}`,
						);

						// Only emit done if not suspended again
						if (!sessionSuspended.has(input.sessionId)) {
							superagentEmitter.emit(input.sessionId, {
								type: "done",
							});
							sessionRunIds.delete(input.sessionId);
							sessionContext.delete(input.sessionId);
						}
					} catch (error) {
						console.error("[ai-chat/approveToolCall] Stream failed:", error);
						superagentEmitter.emit(input.sessionId, {
							type: "error",
							error: error instanceof Error ? error.message : String(error),
						});
					}
				})();

				return { success: true };
			}),

		/** Legacy: approve tool use via session manager */
		approveToolUse: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					toolUseId: z.string(),
					approved: z.boolean(),
					updatedInput: z.record(z.string(), z.unknown()).optional(),
				}),
			)
			.mutation(({ input }) => {
				chatSessionManager.resolvePermission({
					sessionId: input.sessionId,
					toolUseId: input.toolUseId,
					approved: input.approved,
					updatedInput: input.updatedInput,
				});
				return { success: true };
			}),
	});
};
