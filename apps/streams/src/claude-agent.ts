/**
 * Claude Agent Endpoint
 *
 * Hono app that acts as an AI agent the proxy can invoke.
 * The proxy's `invokeAgent()` POSTs to this endpoint and parses the SSE response.
 *
 * Flow:
 * 1. Proxy sends { messages, stream, sessionId, cwd, env }
 * 2. Agent extracts latest user message as the prompt
 * 3. Runs `query()` from @anthropic-ai/claude-agent-sdk
 * 4. Converts each SDKMessage to TanStack AI AG-UI chunks
 * 5. Returns SSE response with `data: {chunk}\n\n` lines
 *
 * Session state: Maintains Map<sessionId, claudeSessionId> for multi-turn resume.
 * Binary path: From CLAUDE_BINARY_PATH env var.
 * Auth: From environment (ANTHROPIC_API_KEY or OAuth via ~/.claude/.credentials.json).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { z } from "zod";
import { createConverter } from "./sdk-to-ai-chunks";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_AGENT_TURNS = 25;
const SESSION_MAX_SIZE = 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Request Validation
// ============================================================================

const agentRequestSchema = z.object({
	messages: z
		.array(z.object({ role: z.string(), content: z.string() }))
		.optional(),
	stream: z.boolean().optional(),
	sessionId: z.string().optional(),
	cwd: z.string().optional(),
	env: z.record(z.string(), z.string()).optional(),
});

// ============================================================================
// Session State
// ============================================================================

interface SessionEntry {
	claudeSessionId: string;
	lastAccessedAt: number;
}

const claudeSessions = new Map<string, SessionEntry>();

function evictStaleSessions(): void {
	const now = Date.now();
	for (const [key, entry] of claudeSessions) {
		if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
			claudeSessions.delete(key);
		}
	}

	// If still over capacity, evict oldest entries
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
}

// ============================================================================
// App
// ============================================================================

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

	const { messages, sessionId, cwd, env: agentEnv } = parsed.data;

	// Extract prompt from latest user message
	const latestUserMessage = messages?.filter((m) => m.role === "user").pop();

	if (!latestUserMessage) {
		return c.json({ error: "No user message found" }, 400);
	}

	const prompt = latestUserMessage.content;
	const claudeSessionId = sessionId ? getClaudeSessionId(sessionId) : undefined;

	// Build environment for Claude binary
	const baseEnv =
		agentEnv ?? (process.env as unknown as Record<string, string>);
	const queryEnv: Record<string, string> = { ...baseEnv };

	// Ensure CLAUDE_CODE_ENTRYPOINT is set
	queryEnv.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";

	const binaryPath = process.env.CLAUDE_BINARY_PATH;

	// Run Claude query
	const abortController = new AbortController();
	const result = query({
		prompt,
		options: {
			...(claudeSessionId && { resume: claudeSessionId }),
			...(cwd && { cwd }),
			model: process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
			maxTurns: MAX_AGENT_TURNS,
			includePartialMessages: true,
			permissionMode: "bypassPermissions" as const,
			...(binaryPath && { pathToClaudeCodeExecutable: binaryPath }),
			env: queryEnv,
			abortController,
		},
	});

	// Create stateful converter
	const converter = createConverter();

	// Abort handling: when the fetch is aborted, interrupt the query
	const requestSignal = c.req.raw.signal;
	const abortHandler = () => {
		abortController.abort();
		result.interrupt().catch(() => {});
		result.close();
	};
	requestSignal.addEventListener("abort", abortHandler, { once: true });

	// Return SSE response
	const encoder = new TextEncoder();
	const readable = new ReadableStream({
		async start(controller) {
			try {
				for await (const message of result) {
					if (requestSignal.aborted) break;

					// Extract claudeSessionId from system init
					const msg = message as Record<string, unknown>;
					if (msg.type === "system" && msg.subtype === "init") {
						const sdkSessionId = msg.session_id as string | undefined;
						if (sdkSessionId && sessionId) {
							setClaudeSessionId(sessionId, sdkSessionId);
						}
						continue;
					}

					// Convert SDKMessage to AG-UI chunks
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
							"[claude-agent] Controller already closed, could not write error event:",
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

// Health check for the agent
app.get("/health", (c) => {
	return c.json({
		status: "ok",
		agent: "claude",
		hasBinary: !!process.env.CLAUDE_BINARY_PATH,
		activeSessions: claudeSessions.size,
	});
});

export { app as claudeAgentApp };
