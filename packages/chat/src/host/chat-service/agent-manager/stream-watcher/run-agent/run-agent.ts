import { RequestContext, superagent } from "@superset/agent";
import type { UIMessage } from "ai";
import type { GetHeaders } from "../../../../lib/auth/auth";
import {
	type SessionContext,
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
import { runWithProviderAuthRetry } from "./provider-auth-retry";
import {
	buildAgentCallOptions,
	buildRequestEntries,
	buildResumeData,
	buildStreamInput,
	normalizeToolCallId,
} from "./run-agent-options";
import {
	clearSessionStateForFailure,
	releaseSessionAbortController,
	resetSessionAbortController,
} from "./run-agent-session";
import {
	logRunAgentFailure,
	writeErrorChunkBestEffort,
	writeToDurableStream,
} from "./run-agent-stream";

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

	const abortController = resetSessionAbortController(sessionId);
	const authHeaders = await resolveAuthHeaders(getHeaders);
	const requestEntries = buildRequestEntries({
		modelId,
		cwd,
		apiUrl,
		authHeaders,
		thinkingEnabled,
	});

	sessionContext.set(sessionId, {
		cwd,
		modelId,
		permissionMode,
		thinkingEnabled,
		requestEntries,
	});

	try {
		const contextInstructions = await buildContextInstructions({
			text,
			cwd,
			apiUrl,
			getHeaders,
		});
		const streamInput = buildStreamInput(text, message);
		const requestContext = new RequestContext(requestEntries);
		const agentCallOptions = buildAgentCallOptions({
			requestContext,
			sessionId,
			abortSignal: abortController.signal,
			permissionMode,
			thinkingEnabled,
		});

		const output = await runWithProviderAuthRetry(
			() =>
				superagent.stream(streamInput, {
					...agentCallOptions,
					...(contextInstructions ? { instructions: contextInstructions } : {}),
				}),
			{ modelId },
		);

		if (output.runId) {
			sessionRunIds.set(sessionId, output.runId);
		}

		await writeToDurableStream(output, host, abortController.signal, {
			runId: output.runId,
		});
	} catch (error) {
		if (abortController.signal.aborted) {
			return;
		}

		await handleRunAgentFailure({
			sessionId,
			host,
			error,
			scope: "Stream error",
		});
	} finally {
		releaseSessionAbortController(sessionId, abortController);
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
	fallbackContext?: SessionContext;
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

	const ctx = resolveSessionContextForToolOutput({
		sessionId,
		fallbackContext,
	});
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

	const abortController = resetSessionAbortController(sessionId);
	const resumeData = buildResumeData(state, output);
	const requestContext = new RequestContext([...ctx.requestEntries]);
	const agentCallOptions = buildAgentCallOptions({
		requestContext,
		sessionId,
		abortSignal: abortController.signal,
		permissionMode: ctx.permissionMode,
		thinkingEnabled: ctx.thinkingEnabled,
	});

	try {
		const stream = await runWithProviderAuthRetry(
			() =>
				superagent.resumeStream(resumeData, {
					runId,
					toolCallId: normalizeToolCallId(toolCallId),
					...agentCallOptions,
				}),
			{ modelId: ctx.modelId },
		);

		if (stream.runId) {
			sessionRunIds.set(sessionId, stream.runId);
		}

		await writeToDurableStream(stream, host, abortController.signal, {
			runId: stream.runId ?? runId,
		});
	} catch (error) {
		if (abortController.signal.aborted) {
			return;
		}

		await handleRunAgentFailure({
			sessionId,
			host,
			error,
			scope: "Tool output continue error",
			context: {
				toolCallId,
				toolName,
				state,
				errorText,
			},
		});
	} finally {
		releaseSessionAbortController(sessionId, abortController);
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
		if (ctx) {
			ctx.permissionMode = permissionMode;
		}
	}

	const ctx = sessionContext.get(sessionId);
	const reqCtx = new RequestContext(ctx ? [...ctx.requestEntries] : []);
	const abortController = resetSessionAbortController(sessionId);

	try {
		const stream = await runWithProviderAuthRetry(
			() =>
				approved
					? superagent.approveToolCall({
							runId,
							...(toolCallId ? { toolCallId } : {}),
							requestContext: reqCtx,
						})
					: superagent.declineToolCall({
							runId,
							...(toolCallId ? { toolCallId } : {}),
							requestContext: reqCtx,
						}),
			{ modelId: ctx?.modelId },
		);

		await writeToDurableStream(stream, host, abortController.signal, {
			runId,
		});
	} catch (error) {
		if (abortController.signal.aborted) {
			return;
		}

		await handleRunAgentFailure({
			sessionId,
			host,
			error,
			scope: "Resume error",
		});
	} finally {
		releaseSessionAbortController(sessionId, abortController);
	}
}

async function resolveAuthHeaders(
	getHeaders: GetHeaders,
): Promise<Record<string, string>> {
	try {
		return await getHeaders();
	} catch (error) {
		console.warn("[run-agent] Failed to resolve auth headers:", error);
		return {};
	}
}

async function buildContextInstructions(options: {
	text: string;
	cwd: string;
	apiUrl: string;
	getHeaders: GetHeaders;
}): Promise<string | undefined> {
	const projectContext = await gatherProjectContext(options.cwd);
	const fileMentions = parseFileMentions(options.text, options.cwd);
	const fileMentionContext = buildFileMentionContext(fileMentions);
	const taskSlugs = parseTaskMentions(options.text);
	const taskMentionContext = await buildTaskMentionContext(taskSlugs, {
		apiUrl: options.apiUrl,
		getHeaders: options.getHeaders,
	});
	return projectContext + fileMentionContext + taskMentionContext || undefined;
}

function resolveSessionContextForToolOutput(options: {
	sessionId: string;
	fallbackContext?: SessionContext;
}): SessionContext | null {
	let ctx = sessionContext.get(options.sessionId) ?? null;
	if (ctx || !options.fallbackContext) {
		return ctx;
	}

	ctx = {
		cwd: options.fallbackContext.cwd,
		modelId: options.fallbackContext.modelId,
		permissionMode: options.fallbackContext.permissionMode,
		thinkingEnabled: options.fallbackContext.thinkingEnabled,
		requestEntries: [...options.fallbackContext.requestEntries],
	};
	sessionContext.set(options.sessionId, ctx);
	return ctx;
}

async function handleRunAgentFailure(options: {
	sessionId: string;
	host: SessionHost;
	error: unknown;
	scope: string;
	context?: Record<string, unknown>;
}): Promise<void> {
	clearSessionStateForFailure(options.sessionId);
	await writeErrorChunkBestEffort(options.host, options.error);
	logRunAgentFailure({
		sessionId: options.sessionId,
		scope: options.scope,
		error: options.error,
		...(options.context ? { context: options.context } : {}),
	});
}
