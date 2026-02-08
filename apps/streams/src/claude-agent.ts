import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type HookCallbackMatcher,
	type HookEvent,
	type Options,
	query,
} from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { z } from "zod";
import { createConverter } from "./sdk-to-ai-chunks";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_AGENT_TURNS = 25;
const SESSION_MAX_SIZE = 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const notificationSchema = z.object({
	port: z.number(),
	paneId: z.string().optional(),
	tabId: z.string().optional(),
	workspaceId: z.string().optional(),
	env: z.string().optional(),
});

const agentRequestSchema = z.object({
	messages: z
		.array(z.object({ role: z.string(), content: z.string() }))
		.optional(),
	stream: z.boolean().optional(),
	sessionId: z.string().optional(),
	cwd: z.string().optional(),
	env: z.record(z.string(), z.string()).optional(),
	notification: notificationSchema.optional(),
	model: z.string().optional(),
	permissionMode: z
		.enum(["default", "acceptEdits", "bypassPermissions"])
		.optional(),
	allowedTools: z.array(z.string()).optional(),
	disallowedTools: z.array(z.string()).optional(),
	maxBudgetUsd: z.number().optional(),
	maxThinkingTokens: z.number().optional(),
	fallbackModel: z.string().optional(),
	additionalDirectories: z.array(z.string()).optional(),
	betas: z.array(z.string()).optional(),
});

interface SessionEntry {
	claudeSessionId: string;
	lastAccessedAt: number;
}

const claudeSessions = new Map<string, SessionEntry>();

const SESSIONS_DIR =
	process.env.DURABLE_STREAMS_DATA_DIR ??
	join(homedir(), ".superset", "chat-streams");
const SESSIONS_FILE = join(SESSIONS_DIR, "claude-sessions.json");

function loadPersistedSessions(): void {
	try {
		if (existsSync(SESSIONS_FILE)) {
			const raw = readFileSync(SESSIONS_FILE, "utf-8");
			const entries = JSON.parse(raw) as Array<[string, SessionEntry]>;
			for (const [key, entry] of entries) {
				claudeSessions.set(key, entry);
			}
			console.log(`[claude-agent] Loaded ${entries.length} persisted sessions`);
		}
	} catch (err) {
		console.warn("[claude-agent] Failed to load persisted sessions:", err);
	}
}

function persistSessions(): void {
	try {
		if (!existsSync(SESSIONS_DIR)) {
			mkdirSync(SESSIONS_DIR, { recursive: true });
		}
		const entries = Array.from(claudeSessions.entries());
		writeFileSync(SESSIONS_FILE, JSON.stringify(entries), "utf-8");
	} catch (err) {
		console.warn("[claude-agent] Failed to persist sessions:", err);
	}
}

loadPersistedSessions();

function evictStaleSessions(): void {
	const now = Date.now();
	for (const [key, entry] of claudeSessions) {
		if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
			claudeSessions.delete(key);
		}
	}

	if (claudeSessions.size > SESSION_MAX_SIZE) {
		const sorted = [...claudeSessions.entries()].sort(
			(a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
		);
		const toRemove = sorted.slice(0, claudeSessions.size - SESSION_MAX_SIZE);
		for (const [key] of toRemove) {
			claudeSessions.delete(key);
		}
	}
}

function getClaudeSessionId(sessionId: string): string | undefined {
	const entry = claudeSessions.get(sessionId);
	if (entry) {
		entry.lastAccessedAt = Date.now();
	}
	return entry?.claudeSessionId;
}

function setClaudeSessionId(sessionId: string, claudeSessionId: string): void {
	evictStaleSessions();
	claudeSessions.set(sessionId, {
		claudeSessionId,
		lastAccessedAt: Date.now(),
	});
	persistSessions();
}

interface PendingPermission {
	resolve: (
		result:
			| { behavior: "allow"; updatedInput?: Record<string, unknown> }
			| { behavior: "deny"; message: string },
	) => void;
	reject: (error: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

const pendingPermissions = new Map<string, PendingPermission>();

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

type NotificationContext = z.infer<typeof notificationSchema>;

function buildNotificationHooks({
	notification,
}: {
	notification: NotificationContext;
}): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
	const baseUrl = `http://localhost:${notification.port}/hook/complete`;

	const buildUrl = (eventType: string): string => {
		const params = new URLSearchParams({ eventType });
		if (notification.paneId) params.set("paneId", notification.paneId);
		if (notification.tabId) params.set("tabId", notification.tabId);
		if (notification.workspaceId)
			params.set("workspaceId", notification.workspaceId);
		if (notification.env) params.set("env", notification.env);
		return `${baseUrl}?${params.toString()}`;
	};

	const createHookMatcher = (eventType: string): HookCallbackMatcher => ({
		hooks: [
			async () => {
				try {
					await fetch(buildUrl(eventType));
				} catch (err) {
					console.warn(`[claude-agent] Failed to notify ${eventType}:`, err);
				}
				return { continue: true };
			},
		],
	});

	return {
		UserPromptSubmit: [createHookMatcher("UserPromptSubmit")],
		Stop: [createHookMatcher("Stop")],
	};
}

const app = new Hono();

app.post("/", async (c) => {
	let rawBody: unknown;
	try {
		rawBody = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = agentRequestSchema.safeParse(rawBody);

	if (!parsed.success) {
		return c.json(
			{ error: "Invalid request body", details: parsed.error.message },
			400,
		);
	}

	const {
		messages,
		sessionId,
		cwd,
		env: agentEnv,
		notification,
		model,
		permissionMode,
		allowedTools,
		disallowedTools,
		maxBudgetUsd,
		maxThinkingTokens,
		fallbackModel,
		additionalDirectories,
		betas,
	} = parsed.data;

	const latestUserMessage = messages?.filter((m) => m.role === "user").pop();

	if (!latestUserMessage) {
		return c.json({ error: "No user message found" }, 400);
	}

	const prompt = latestUserMessage.content;
	const claudeSessionId = sessionId ? getClaudeSessionId(sessionId) : undefined;

	const baseEnv =
		agentEnv ?? (process.env as unknown as Record<string, string>);
	const queryEnv: Record<string, string> = { ...baseEnv };
	queryEnv.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";

	const binaryPath = process.env.CLAUDE_BINARY_PATH;

	const hooks = notification
		? buildNotificationHooks({ notification })
		: undefined;

	const resolvedPermissionMode = permissionMode ?? "bypassPermissions";

	const converter = createConverter();
	const encoder = new TextEncoder();
	const requestSignal = c.req.raw.signal;

	let streamController: ReadableStreamDefaultController<Uint8Array> | null =
		null;

	function emitSSE(data: unknown): void {
		if (streamController && !requestSignal.aborted) {
			try {
				streamController.enqueue(
					encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
				);
			} catch {}
		}
	}

	const needsApproval = resolvedPermissionMode !== "bypassPermissions";

	const canUseTool = needsApproval
		? async (
				toolName: string,
				input: Record<string, unknown>,
				options: { toolUseID: string; signal: AbortSignal },
			) => {
				const toolUseId = options.toolUseID;

				if (toolName === "AskUserQuestion") {
					emitSSE({
						type: "USER_QUESTION_REQUEST",
						toolCallId: toolUseId,
						toolName,
						questions: input?.questions,
						timestamp: Date.now(),
					});
				} else {
					emitSSE({
						type: "TOOL_CALL_APPROVAL",
						toolCallId: toolUseId,
						toolName,
						input,
						timestamp: Date.now(),
					});
				}

				return new Promise<
					| {
							behavior: "allow";
							updatedInput?: Record<string, unknown>;
					  }
					| { behavior: "deny"; message: string }
				>((resolve, reject) => {
					const timeoutId = setTimeout(() => {
						pendingPermissions.delete(toolUseId);
						resolve({
							behavior: "deny",
							message: "Permission request timed out",
						});
					}, PERMISSION_TIMEOUT_MS);

					pendingPermissions.set(toolUseId, {
						resolve,
						reject,
						timeoutId,
					});

					options.signal.addEventListener(
						"abort",
						() => {
							pendingPermissions.delete(toolUseId);
							clearTimeout(timeoutId);
							reject(new Error("Aborted"));
						},
						{ once: true },
					);
				});
			}
		: undefined;

	const abortController = new AbortController();
	const result = query({
		prompt,
		options: {
			...(claudeSessionId && { resume: claudeSessionId }),
			...(cwd && { cwd }),
			model: model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
			maxTurns: MAX_AGENT_TURNS,
			includePartialMessages: true,
			permissionMode: resolvedPermissionMode as
				| "default"
				| "acceptEdits"
				| "bypassPermissions",
			settingSources: ["user", "project", "local"],
			systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
			...(binaryPath && { pathToClaudeCodeExecutable: binaryPath }),
			env: queryEnv,
			abortController,
			...(hooks && { hooks }),
			...(canUseTool && { canUseTool }),
			...(allowedTools && { allowedTools }),
			...(disallowedTools && { disallowedTools }),
			...(maxBudgetUsd !== undefined && { maxBudgetUsd }),
			...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
			...(fallbackModel && { fallbackModel }),
			...(additionalDirectories && { additionalDirectories }),
			...(betas && { betas: betas as Options["betas"] }),
		},
	});

	const abortHandler = () => {
		abortController.abort();
		result.interrupt().catch(() => {});
		result.close();
	};
	requestSignal.addEventListener("abort", abortHandler, { once: true });

	const readable = new ReadableStream({
		async start(controller) {
			streamController = controller;
			try {
				for await (const message of result) {
					if (requestSignal.aborted) break;

					const msg = message as Record<string, unknown>;
					if (msg.type === "system" && msg.subtype === "init") {
						const sdkSessionId = msg.session_id as string | undefined;
						if (sdkSessionId && sessionId) {
							setClaudeSessionId(sessionId, sdkSessionId);
						}
						continue;
					}

					const chunks = converter.convert(message);
					for (const chunk of chunks) {
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
						);
					}
				}

				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					console.error("[claude-agent] Stream error:", err);
					const errorChunk = {
						type: "RUN_ERROR",
						runId: converter.state.runId,
						error: {
							message: (err as Error).message ?? "Unknown error",
						},
						timestamp: Date.now(),
					};
					try {
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
						);
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					} catch (enqueueErr) {
						console.debug(
							"[claude-agent] Controller already closed:",
							enqueueErr,
						);
					}
				}

				try {
					controller.close();
				} catch (closeErr) {
					console.debug("[claude-agent] Controller already closed:", closeErr);
				}
			} finally {
				streamController = null;
				requestSignal.removeEventListener("abort", abortHandler);
				try {
					result.close();
				} catch (resultCloseErr) {
					console.debug(
						"[claude-agent] Result already closed:",
						resultCloseErr,
					);
				}
			}
		},
	});

	return new Response(readable, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});

app.post("/approvals/:toolUseId", async (c) => {
	const toolUseId = c.req.param("toolUseId");
	const pending = pendingPermissions.get(toolUseId);

	if (!pending) {
		return c.json({ error: "No pending permission for this tool use" }, 404);
	}

	try {
		const body = (await c.req.json()) as {
			approved: boolean;
			updatedInput?: Record<string, unknown>;
		};
		pendingPermissions.delete(toolUseId);
		clearTimeout(pending.timeoutId);

		if (body.approved) {
			pending.resolve({
				behavior: "allow",
				...(body.updatedInput !== undefined && {
					updatedInput: body.updatedInput,
				}),
			});
		} else {
			pending.resolve({ behavior: "deny", message: "User denied permission" });
		}

		return c.json({ ok: true });
	} catch (err) {
		return c.json({ error: (err as Error).message }, 400);
	}
});

app.post("/answers/:toolUseId", async (c) => {
	const toolUseId = c.req.param("toolUseId");
	const pending = pendingPermissions.get(toolUseId);

	if (!pending) {
		return c.json({ error: "No pending question for this tool use" }, 404);
	}

	try {
		const body = (await c.req.json()) as {
			answers: Record<string, string>;
			originalInput?: Record<string, unknown>;
		};
		pendingPermissions.delete(toolUseId);
		clearTimeout(pending.timeoutId);

		pending.resolve({
			behavior: "allow",
			updatedInput: {
				...(body.originalInput ?? {}),
				answers: body.answers,
			},
		});

		return c.json({ ok: true });
	} catch (err) {
		return c.json({ error: (err as Error).message }, 400);
	}
});

app.get("/sessions/:sessionId", (c) => {
	const sessionId = c.req.param("sessionId");
	const claudeSessionId = getClaudeSessionId(sessionId);

	if (!claudeSessionId) {
		return c.json({ error: "Session not found" }, 404);
	}

	return c.json({ claudeSessionId });
});

app.get("/health", (c) => {
	return c.json({
		status: "ok",
		agent: "claude",
		hasBinary: !!process.env.CLAUDE_BINARY_PATH,
		activeSessions: claudeSessions.size,
	});
});

export { app as claudeAgentApp };
