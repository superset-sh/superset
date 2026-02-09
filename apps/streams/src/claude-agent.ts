import { type Options, query } from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { z } from "zod";
import {
	getActiveSessionCount,
	getClaudeSessionId,
	setClaudeSessionId,
} from "./claude-session-store";
import {
	buildNotificationHooks,
	notificationSchema,
} from "./notification-hooks";
import {
	createPermissionRequest,
	getPendingPermission,
	resolvePendingPermission,
} from "./permission-manager";
import { createConverter } from "./sdk-to-ai-chunks";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_AGENT_TURNS = 25;

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

const approvalBodySchema = z.object({
	approved: z.boolean(),
	updatedInput: z.record(z.string(), z.unknown()).optional(),
});

const answerBodySchema = z.object({
	answers: z.record(z.string(), z.string()),
	originalInput: z.record(z.string(), z.unknown()).optional(),
});

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
			} catch (err) {
				console.debug("[claude-agent] Failed to enqueue SSE:", err);
			}
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

				emitSSE({
					type: "CUSTOM",
					name: "approval-requested",
					data: {
						toolCallId: toolUseId,
						toolName,
						input,
						approval: { id: toolUseId, needsApproval: true },
					},
					timestamp: Date.now(),
				});

				return createPermissionRequest({
					toolUseId,
					signal: options.signal,
				});
			}
		: undefined;

	const abortController = new AbortController();
	const result = query({
		prompt,
		options: {
			...(claudeSessionId && { resume: claudeSessionId }),
			...(cwd && { cwd }),
			model: model ?? DEFAULT_MODEL,
			maxTurns: MAX_AGENT_TURNS,
			includePartialMessages: true,
			permissionMode: resolvedPermissionMode as
				| "default"
				| "acceptEdits"
				| "bypassPermissions",
			settingSources: ["user", "project", "local"],
			systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
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

	if (!getPendingPermission(toolUseId)) {
		return c.json({ error: "No pending permission for this tool use" }, 404);
	}

	let rawBody: unknown;
	try {
		rawBody = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = approvalBodySchema.safeParse(rawBody);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid request body", details: parsed.error.message },
			400,
		);
	}

	const { approved, updatedInput } = parsed.data;

	resolvePendingPermission({
		toolUseId,
		result: approved
			? { behavior: "allow", updatedInput: updatedInput ?? {} }
			: { behavior: "deny", message: "User denied permission" },
	});

	return c.json({ ok: true });
});

app.post("/answers/:toolUseId", async (c) => {
	const toolUseId = c.req.param("toolUseId");

	if (!getPendingPermission(toolUseId)) {
		return c.json({ error: "No pending question for this tool use" }, 404);
	}

	let rawBody: unknown;
	try {
		rawBody = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = answerBodySchema.safeParse(rawBody);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid request body", details: parsed.error.message },
			400,
		);
	}

	const { answers, originalInput } = parsed.data;

	resolvePendingPermission({
		toolUseId,
		result: {
			behavior: "allow",
			updatedInput: {
				...(originalInput ?? {}),
				answers,
			},
		},
	});

	return c.json({ ok: true });
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
		activeSessions: getActiveSessionCount(),
	});
});

export { app as claudeAgentApp };
