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
import { createConverter } from "./sdk-to-ai-chunks";

const app = new Hono();

// Session state for multi-turn resume
const claudeSessions = new Map<string, string>();

app.post("/", async (c) => {
	const body = await c.req.json<{
		messages?: Array<{ role: string; content: string }>;
		stream?: boolean;
		sessionId?: string;
		cwd?: string;
		env?: Record<string, string>;
	}>();

	const { messages, sessionId, cwd, env: agentEnv } = body;

	// Extract prompt from latest user message
	const latestUserMessage = messages?.filter((m) => m.role === "user").pop();

	if (!latestUserMessage) {
		return c.json({ error: "No user message found" }, 400);
	}

	const prompt = latestUserMessage.content;
	const claudeSessionId = sessionId ? claudeSessions.get(sessionId) : undefined;

	// Build environment for Claude binary
	const queryEnv: Record<string, string> = {
		...(agentEnv ?? (process.env as Record<string, string>)),
	};

	// Ensure CLAUDE_CODE_ENTRYPOINT is set
	queryEnv.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";

	const binaryPath = process.env.CLAUDE_BINARY_PATH;

	// Run Claude query
	const result = query({
		prompt,
		options: {
			...(claudeSessionId && { resume: claudeSessionId }),
			...(cwd && { cwd }),
			model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929",
			maxTurns: 25,
			includePartialMessages: true,
			permissionMode: "bypassPermissions" as const,
			...(binaryPath && { pathToClaudeCodeExecutable: binaryPath }),
			env: queryEnv,
			abortController: new AbortController(),
		},
	});

	// Create stateful converter
	const converter = createConverter();

	// Abort handling: when the fetch is aborted, interrupt the query
	const requestSignal = c.req.raw.signal;
	const abortHandler = () => {
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
							claudeSessions.set(sessionId, sdkSessionId);
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
					// Write an error event before closing
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
					} catch {
						// Controller may already be closed
					}
				}

				try {
					controller.close();
				} catch {
					// Already closed
				}
			} finally {
				requestSignal.removeEventListener("abort", abortHandler);
				try {
					result.close();
				} catch {
					// Already closed
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
