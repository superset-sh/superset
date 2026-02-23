import {
	type LoadedMcpToolsetsResult,
	loadMcpToolsetsForChat,
	RequestContext,
	superagent,
	toAISdkStream,
} from "@superset/agent";
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
	mcpToolsets?: LoadedMcpToolsetsResult;
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
		mcpToolsets: preloadedMcpToolsets,
	} = options;

	// Abort any existing agent for this session
	const existingController = sessionAbortControllers.get(sessionId);
	if (existingController) existingController.abort();

	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);
	let disconnectMcpToolsets: (() => Promise<void>) | null = null;

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

		const mcpToolsets =
			preloadedMcpToolsets ??
			(await loadMcpToolsetsForChat({
				cwd,
				apiUrl,
				authHeaders,
			}));
		if (!preloadedMcpToolsets) {
			disconnectMcpToolsets = mcpToolsets.disconnect;
		}

		try {
			await writeMcpConfigChunk(host, {
				serverNames: mcpToolsets.serverNames,
				sources: mcpToolsets.sources,
				errors: mcpToolsets.errors,
			});
		} catch (error) {
			console.warn("[run-agent] Failed to persist MCP config chunk:", error);
		}

		for (const message of mcpToolsets.errors) {
			console.warn("[run-agent] MCP:", message);
		}
		if (mcpToolsets.serverNames.length > 0) {
			console.log(
				`[run-agent] Loaded MCP servers for ${sessionId}: ${mcpToolsets.serverNames.join(", ")}`,
			);
		}

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
			...(mcpToolsets.toolsets ? { toolsets: mcpToolsets.toolsets } : {}),
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
		if (disconnectMcpToolsets) {
			try {
				await disconnectMcpToolsets();
			} catch (error) {
				console.warn("[run-agent] Failed to disconnect MCP toolsets:", error);
			}
		}

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

	const reqCtx = new RequestContext(ctxEntries);
	const abortController = new AbortController();
	sessionAbortControllers.set(sessionId, abortController);

	try {
		const approvalOpts = {
			runId,
			requestContext: reqCtx,
		};

		const stream = approved
			? await superagent.approveToolCall(approvalOpts)
			: await superagent.declineToolCall(approvalOpts);

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

export interface McpConfigSnapshot {
	serverNames: string[];
	sources: string[];
	errors: string[];
}

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

async function writeConfigChunk(
	host: SessionHost,
	payload: Record<string, unknown>,
): Promise<void> {
	const messageId = crypto.randomUUID();
	const stream = new ReadableStream<UIMessageChunk>({
		start(controller) {
			controller.enqueue({
				type: "config",
				...payload,
			} as unknown as UIMessageChunk);
			controller.close();
		},
	});
	await host.writeStream(messageId, stream);
}

export async function writeMcpConfigChunk(
	host: SessionHost,
	snapshot: McpConfigSnapshot,
): Promise<void> {
	await writeConfigChunk(host, {
		mcp: {
			serverNames: snapshot.serverNames,
			sources: snapshot.sources,
			errors: snapshot.errors,
			updatedAt: new Date().toISOString(),
		},
	});
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
