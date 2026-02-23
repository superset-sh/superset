import {
	RequestContext,
	setAnthropicAuthToken,
	superagent,
	toAISdkStream,
} from "@superset/agent";
import type { UIMessage, UIMessageChunk } from "ai";
import { getOrRefreshAnthropicOAuthCredentials } from "../../../../auth/anthropic";
import type { GetHeaders } from "../../../../lib/auth/auth";
import {
	sessionAbortControllers,
	sessionContext,
	sessionRunIds,
} from "../../session-state";
import type { SessionHost } from "../session-host";
import {
	buildFileMentionContext,
	parseFileMentions,
} from "./context/file-mentions";
import { gatherProjectContext } from "./context/project-context";
import {
	buildTaskMentionContext,
	parseTaskMentions,
} from "./context/task-mentions";

// ---------------------------------------------------------------------------
// runAgent — core agent execution
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
	sessionId: string;
	text: string;
	message?: UIMessage;
	host: SessionHost;
	modelId: string;
	cwd: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
	apiUrl: string;
	getHeaders: GetHeaders;
}

async function syncAnthropicOAuthToken(options?: {
	forceRefresh?: boolean;
}): Promise<boolean> {
	try {
		const oauthCredentials = await getOrRefreshAnthropicOAuthCredentials({
			forceRefresh: options?.forceRefresh,
		});

		if (!oauthCredentials) {
			setAnthropicAuthToken(null);
			return false;
		}

		setAnthropicAuthToken(oauthCredentials.apiKey);
		return true;
	} catch (error) {
		console.warn("[run-agent] Failed to sync Anthropic OAuth token:", error);
		if (options?.forceRefresh) {
			setAnthropicAuthToken(null);
		}
		return false;
	}
}

function isAnthropicOAuthExpiredError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const normalized = message.toLowerCase();

	if (normalized.includes("oauth token has expired")) {
		return true;
	}
	if (
		normalized.includes("authentication_error") &&
		normalized.includes("oauth")
	) {
		return true;
	}
	if (
		normalized.includes("api.anthropic.com") &&
		normalized.includes("token") &&
		normalized.includes("expired")
	) {
		return true;
	}

	return false;
}

async function withAnthropicOAuthRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	await syncAnthropicOAuthToken();

	try {
		return await operation();
	} catch (error) {
		if (!isAnthropicOAuthExpiredError(error)) {
			throw error;
		}

		const refreshed = await syncAnthropicOAuthToken({ forceRefresh: true });
		if (!refreshed) {
			throw error;
		}

		console.warn(
			"[run-agent] Retrying agent call after Anthropic OAuth refresh",
		);
		return operation();
	}
}

export async function runAgent(options: RunAgentOptions): Promise<void> {
	const {
		sessionId,
		text,
		message,
		host,
		modelId,
		cwd,
		permissionMode,
		thinkingEnabled,
		apiUrl,
		getHeaders,
	} = options;

	// Abort any existing agent for this session
	const existingController = sessionAbortControllers.get(sessionId);
	if (existingController) existingController.abort();

	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	let authHeaders: Record<string, string> = {};
	try {
		authHeaders = await getHeaders();
	} catch (error) {
		console.warn("[run-agent] Failed to resolve auth headers:", error);
	}

	const requestEntries: [string, string][] = [
		["modelId", modelId],
		["cwd", cwd],
		["apiUrl", apiUrl],
	];
	if (Object.keys(authHeaders).length > 0) {
		requestEntries.push(["authHeaders", JSON.stringify(authHeaders)]);
	}
	if (thinkingEnabled) {
		requestEntries.push(["thinkingEnabled", "true"]);
	}

	sessionContext.set(sessionId, {
		cwd,
		modelId,
		permissionMode,
		requestEntries,
	});

	try {
		const projectContext = await gatherProjectContext(cwd);
		const fileMentions = parseFileMentions(text, cwd);
		const fileMentionContext = buildFileMentionContext(fileMentions);
		const taskSlugs = parseTaskMentions(text);
		const taskMentionContext = await buildTaskMentionContext(taskSlugs, {
			apiUrl,
			getHeaders,
		});
		const contextInstructions =
			projectContext + fileMentionContext + taskMentionContext || undefined;

		const requireToolApproval =
			permissionMode === "default" || permissionMode === "acceptEdits";

		// When the message has file parts, build a CoreUserMessage with
		// multimodal content so the model receives images/files.
		const fileParts = message?.parts?.filter((p) => p.type === "file") ?? [];
		const streamInput =
			fileParts.length > 0
				? {
						role: "user" as const,
						content: [
							...(text ? [{ type: "text" as const, text }] : []),
							...fileParts.map((f) => {
								if (f.mediaType.startsWith("image/")) {
									return {
										type: "image" as const,
										image: new URL(f.url),
										mimeType: f.mediaType as `image/${string}`,
									};
								}
								return {
									type: "file" as const,
									data: new URL(f.url),
									mimeType: f.mediaType,
								};
							}),
						],
					}
				: text;

		const output = await withAnthropicOAuthRetry(() =>
			superagent.stream(streamInput, {
				requestContext: new RequestContext(requestEntries),
				maxSteps: 100,
				memory: {
					thread: sessionId,
					resource: sessionId,
				},
				abortSignal: abortController.signal,
				...(contextInstructions ? { instructions: contextInstructions } : {}),
				...(requireToolApproval ? { requireToolApproval: true } : {}),
				...(thinkingEnabled
					? {
							providerOptions: {
								anthropic: {
									thinking: {
										type: "enabled",
										budgetTokens: 10000,
									},
								},
							},
						}
					: {}),
			}),
		);

		if (output.runId) {
			sessionRunIds.set(sessionId, output.runId);
		}

		await writeToDurableStream(output, host, abortController.signal);
	} catch (error) {
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

		if (abortController.signal.aborted) return;

		// Write error chunk to stream so client sees isComplete = true
		try {
			await writeErrorChunk(host, error);
		} catch {
			/* best effort */
		}
		console.error(`[run-agent] Stream error for ${sessionId}:`, error);
	} finally {
		if (sessionAbortControllers.get(sessionId) === abortController) {
			sessionAbortControllers.delete(sessionId);
		}
	}
}

// ---------------------------------------------------------------------------
// resumeAgent — approve/decline tool calls, answer questions
// ---------------------------------------------------------------------------

export interface ResumeAgentOptions {
	sessionId: string;
	runId: string;
	host: SessionHost;
	approved: boolean;
	answers?: Record<string, string>;
	permissionMode?: string;
}

export async function resumeAgent(options: ResumeAgentOptions): Promise<void> {
	const { sessionId, runId, host, approved, answers, permissionMode } = options;

	if (permissionMode) {
		const ctx = sessionContext.get(sessionId);
		if (ctx) ctx.permissionMode = permissionMode;
	}

	const ctx = sessionContext.get(sessionId);
	const ctxEntries: [string, string][] = ctx ? [...ctx.requestEntries] : [];

	if (answers) {
		ctxEntries.push(["toolAnswers", JSON.stringify(answers)]);
	}

	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	try {
		const stream = await withAnthropicOAuthRetry(() => {
			const approvalOpts = {
				runId,
				requestContext: new RequestContext(ctxEntries),
			};
			return approved
				? superagent.approveToolCall(approvalOpts)
				: superagent.declineToolCall(approvalOpts);
		});

		await writeToDurableStream(stream, host, abortController.signal);
	} catch (error) {
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

		if (abortController.signal.aborted) return;

		try {
			await writeErrorChunk(host, error);
		} catch {
			/* best effort */
		}
		console.error(`[run-agent] Resume error for ${sessionId}:`, error);
	} finally {
		if (sessionAbortControllers.get(sessionId) === abortController) {
			sessionAbortControllers.delete(sessionId);
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeErrorChunk(
	host: SessionHost,
	error: unknown,
): Promise<void> {
	const messageId = crypto.randomUUID();
	const errorText = error instanceof Error ? error.message : "Agent error";
	const stream = new ReadableStream<UIMessageChunk>({
		start(controller) {
			controller.enqueue({ type: "error", errorText } as UIMessageChunk);
			controller.enqueue({ type: "abort" } as UIMessageChunk);
			controller.close();
		},
	});
	await host.writeStream(messageId, stream);
}

async function writeToDurableStream(
	stream: Parameters<typeof toAISdkStream>[0],
	host: SessionHost,
	abortSignal: AbortSignal,
) {
	const messageId = crypto.randomUUID();
	const aiStream = toAISdkStream(stream, { from: "agent" });

	await host.writeStream(messageId, aiStream as unknown as ReadableStream, {
		signal: abortSignal,
	});
}
