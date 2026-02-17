import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import { sessionStateSchema } from "@superset/durable-session";
import type { UIMessageChunk } from "ai";

/**
 * Ensure a session stream exists on the hosted Durable Streams service.
 * Uses DurableStream.create() directly — the desktop has the service secret.
 */
export async function ensureProxySession(
	streamsUrl: string,
	sessionId: string,
	authToken?: string,
): Promise<void> {
	const headers: Record<string, string> = {};
	if (authToken) headers.Authorization = `Bearer ${authToken}`;

	const stream = new DurableStream({
		url: `${streamsUrl}/v1/stream/sessions/${sessionId}`,
		headers,
	});

	await stream.create({ contentType: "application/json" });
}

interface WriteAgentStreamOptions {
	sessionId: string;
	messageId: string;
	streamsUrl: string;
	authToken?: string;
	abortSignal?: AbortSignal;
}

/**
 * Drain a ReadableStream<UIMessageChunk> (from toAISdkStream) into the
 * durable stream as STATE-PROTOCOL chunk events.
 *
 * Uses @durable-streams/client IdempotentProducer directly against the
 * hosted Durable Streams service for automatic batching and exactly-once delivery.
 */
export async function writeAgentStream(
	stream: ReadableStream<UIMessageChunk>,
	options: WriteAgentStreamOptions,
): Promise<void> {
	const { sessionId, messageId, streamsUrl, authToken, abortSignal } = options;

	const streamUrl = `${streamsUrl}/v1/stream/sessions/${sessionId}`;
	const headers: Record<string, string> = {};
	if (authToken) headers.Authorization = `Bearer ${authToken}`;

	const durableStream = new DurableStream({
		url: streamUrl,
		headers,
	});

	const producer = new IdempotentProducer(
		durableStream,
		`agent-${sessionId}`,
		{
			autoClaim: true,
			lingerMs: 5,
			maxInFlight: 5,
			signal: abortSignal,
			onError: (err) => {
				if (abortSignal?.aborted) return;
				console.error(
					`[write-agent] Producer error for ${sessionId}:`,
					err,
				);
			},
		},
	);

	let seq = 0;
	const reader = stream.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done || abortSignal?.aborted) break;

			const event = sessionStateSchema.chunks.insert({
				key: `${messageId}:${seq}`,
				value: {
					messageId,
					actorId: "agent",
					role: "assistant",
					chunk: JSON.stringify(value),
					seq,
					createdAt: new Date().toISOString(),
				},
			});

			producer.append(JSON.stringify(event));
			seq++;
		}
	} finally {
		try {
			await producer.flush();
			await producer.detach();
		} catch (err) {
			if (!abortSignal?.aborted) {
				console.error(
					`[write-agent] Failed to flush/detach producer for ${sessionId}:`,
					err,
				);
			}
		}
	}
}
