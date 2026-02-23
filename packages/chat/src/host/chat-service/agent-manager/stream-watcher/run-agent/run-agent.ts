import { RequestContext, superagent, toAISdkStream } from "@superset/agent";
import type { UIMessage, UIMessageChunk } from "ai";
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
		thinkingEnabled,
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

		const output = await superagent.stream(streamInput, {
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
		});

		if (output.runId) {
			sessionRunIds.set(sessionId, output.runId);
		}

		await writeToDurableStream(output, host, abortController.signal, {
			runId: output.runId,
		});
	} catch (error) {
		if (abortController.signal.aborted) return;
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

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
// continueAgentWithToolOutput — resume after client tool outputs
// ---------------------------------------------------------------------------

export interface ContinueAgentWithToolOutputOptions {
	sessionId: string;
	host: SessionHost;
	runId?: string;
	toolCallId: string;
	toolName: string;
	state: "output-available" | "output-error";
	output: unknown;
	errorText?: string;
	fallbackContext?: {
		cwd: string;
		modelId: string;
		permissionMode?: string;
		thinkingEnabled?: boolean;
		requestEntries: [string, string][];
	};
}

export async function continueAgentWithToolOutput(
	options: ContinueAgentWithToolOutputOptions,
): Promise<void> {
	const {
		sessionId,
		host,
		runId: explicitRunId,
		toolCallId,
		toolName,
		state,
		output,
		errorText,
		fallbackContext,
	} = options;

	let ctx = sessionContext.get(sessionId);
	if (!ctx && fallbackContext) {
		ctx = {
			cwd: fallbackContext.cwd,
			modelId: fallbackContext.modelId,
			permissionMode: fallbackContext.permissionMode,
			thinkingEnabled: fallbackContext.thinkingEnabled,
			requestEntries: [...fallbackContext.requestEntries],
		};
		sessionContext.set(sessionId, ctx);
	}
	if (!ctx) {
		console.warn(
			`[run-agent] Ignoring tool output for ${sessionId}: missing session context`,
			{ toolCallId, toolName },
		);
		return;
	}
	const runId = explicitRunId ?? sessionRunIds.get(sessionId);
	if (!runId) {
		console.warn(
			`[run-agent] Ignoring tool output for ${sessionId}: missing runId`,
			{ toolCallId, toolName },
		);
		return;
	}
	const normalizedToolCallId =
		typeof toolCallId === "string" ? toolCallId.trim().replace(/^-+/, "") : "";
	const toolCallIdForResume = normalizedToolCallId || toolCallId;

	const existingController = sessionAbortControllers.get(sessionId);
	if (existingController) existingController.abort();

	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	const requireToolApproval =
		ctx.permissionMode === "default" || ctx.permissionMode === "acceptEdits";

	const resumeData =
		state === "output-error"
			? { answers: {} as Record<string, string> }
			: typeof output === "object" &&
					output !== null &&
					"answers" in output &&
					typeof output.answers === "object" &&
					output.answers !== null
				? { answers: output.answers as Record<string, string> }
				: { answers: {} as Record<string, string> };

	try {
		const stream = await superagent.resumeStream(resumeData, {
			runId,
			toolCallId: toolCallIdForResume,
			requestContext: new RequestContext([...ctx.requestEntries]),
			maxSteps: 100,
			memory: {
				thread: sessionId,
				resource: sessionId,
			},
			abortSignal: abortController.signal,
			...(requireToolApproval ? { requireToolApproval: true } : {}),
			...(ctx.thinkingEnabled
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
		});

		if (stream.runId) {
			sessionRunIds.set(sessionId, stream.runId);
		}

		await writeToDurableStream(stream, host, abortController.signal, {
			runId: stream.runId ?? runId,
		});
	} catch (error) {
		if (abortController.signal.aborted) return;
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

		try {
			await writeErrorChunk(host, error);
		} catch {
			/* best effort */
		}
		console.error(
			`[run-agent] Tool output continue error for ${sessionId}:`,
			error,
			{
				toolCallId,
				toolName,
				state,
				errorText,
			},
		);
	} finally {
		if (sessionAbortControllers.get(sessionId) === abortController) {
			sessionAbortControllers.delete(sessionId);
		}
	}
}

// ---------------------------------------------------------------------------
// resumeAgent — approve/decline tool calls
// ---------------------------------------------------------------------------

export interface ResumeAgentOptions {
	sessionId: string;
	runId: string;
	host: SessionHost;
	approved: boolean;
	toolCallId?: string;
	permissionMode?: string;
}

export async function resumeAgent(options: ResumeAgentOptions): Promise<void> {
	const { sessionId, runId, host, approved, toolCallId, permissionMode } =
		options;

	if (permissionMode) {
		const ctx = sessionContext.get(sessionId);
		if (ctx) ctx.permissionMode = permissionMode;
	}

	const ctx = sessionContext.get(sessionId);
	const ctxEntries: [string, string][] = ctx ? [...ctx.requestEntries] : [];

	const reqCtx = new RequestContext(ctxEntries);
	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	try {
		const approvalOpts = {
			runId,
			...(toolCallId ? { toolCallId } : {}),
			requestContext: reqCtx,
		};

		const stream = approved
			? await superagent.approveToolCall(approvalOpts)
			: await superagent.declineToolCall(approvalOpts);

		await writeToDurableStream(stream, host, abortController.signal, {
			runId,
		});
	} catch (error) {
		if (abortController.signal.aborted) return;
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);

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
	options?: { runId?: string },
) {
	const messageId = crypto.randomUUID();
	const aiStream = toAISdkStream(stream, {
		from: "agent",
	}) as unknown as ReadableStream<UIMessageChunk>;
	const streamWithMetadata =
		typeof options?.runId === "string" && options.runId.length > 0
			? prependRunMetadata(aiStream, options.runId)
			: aiStream;

	await host.writeStream(
		messageId,
		streamWithMetadata as unknown as ReadableStream,
		{
			signal: abortSignal,
		},
	);
}

function prependRunMetadata(
	stream: ReadableStream<UIMessageChunk>,
	runId: string,
): ReadableStream<UIMessageChunk> {
	const reader = stream.getReader();
	let metadataSent = false;

	return new ReadableStream<UIMessageChunk>({
		async pull(controller) {
			if (!metadataSent) {
				metadataSent = true;
				controller.enqueue({
					type: "message-metadata",
					messageMetadata: { runId },
				} as UIMessageChunk);
				return;
			}
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				return;
			}
			controller.enqueue(value as UIMessageChunk);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
}
