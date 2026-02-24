import { toAISdkStream } from "@superset/agent";
import type { UIMessageChunk } from "ai";
import type { SessionHost } from "../session-host";
import {
	ANTHROPIC_OAUTH_REAUTH_REQUIRED_ERROR_CODE,
	ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE,
	isAnthropicOAuthReauthRequiredError,
} from "./oauth-retry";

export function buildRunAgentErrorChunk(error: unknown): UIMessageChunk {
	const isOAuthReauthError = isAnthropicOAuthReauthRequiredError(error);
	const errorText = isOAuthReauthError
		? ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE
		: error instanceof Error
			? error.message
			: "Agent error";

	return {
		type: "error",
		errorText,
		...(isOAuthReauthError
			? { code: ANTHROPIC_OAUTH_REAUTH_REQUIRED_ERROR_CODE }
			: {}),
	} as UIMessageChunk;
}

export async function writeErrorChunk(
	host: SessionHost,
	error: unknown,
): Promise<void> {
	const messageId = crypto.randomUUID();
	const stream = new ReadableStream<UIMessageChunk>({
		start(controller) {
			controller.enqueue(buildRunAgentErrorChunk(error));
			controller.enqueue({ type: "abort" } as UIMessageChunk);
			controller.close();
		},
	});
	await host.writeStream(messageId, stream);
}

export async function writeErrorChunkBestEffort(
	host: SessionHost,
	error: unknown,
): Promise<void> {
	try {
		await writeErrorChunk(host, error);
	} catch {
		/* best effort */
	}
}

export function logRunAgentFailure(options: {
	sessionId: string;
	scope: string;
	error: unknown;
	context?: Record<string, unknown>;
}): void {
	if (options.context) {
		console.error(
			`[run-agent] ${options.scope} for ${options.sessionId}:`,
			options.error,
			options.context,
		);
		return;
	}

	console.error(
		`[run-agent] ${options.scope} for ${options.sessionId}:`,
		options.error,
	);
}

export function prependRunMetadata(
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

export async function writeToDurableStream(
	stream: Parameters<typeof toAISdkStream>[0],
	host: SessionHost,
	abortSignal: AbortSignal,
	options?: { runId?: string },
): Promise<void> {
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
