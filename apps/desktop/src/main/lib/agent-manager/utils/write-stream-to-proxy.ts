// TODO: The desktop main process currently writes directly to the hosted Durable
// Streams service using DURABLE_STREAMS_SECRET. This should be migrated to go
// through the proxy (apps/api) with Better Auth cookies instead, so that:
// 1. DURABLE_STREAMS_SECRET stays server-side only (not on user devices)
// 2. All clients use the same auth path (Better Auth)
// 3. The proxy owns all write logic (validation, STATE-PROTOCOL events)
// The proxy needs a POST /:id/chunks/batch endpoint for efficient agent streaming.

import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import { sessionStateSchema } from "@superset/durable-session";
import type { UIMessageChunk } from "ai";
import { env } from "main/env.main";

function getStreamHeaders(): Record<string, string> {
	const secret = env.DURABLE_STREAMS_SECRET;
	if (secret) return { Authorization: `Bearer ${secret}` };
	return {};
}

function streamUrl(sessionId: string): string {
	return `${env.NEXT_PUBLIC_STREAMS_URL}/v1/stream/sessions/${sessionId}`;
}

export async function ensureProxySession(sessionId: string): Promise<void> {
	const stream = new DurableStream({
		url: streamUrl(sessionId),
		headers: getStreamHeaders(),
	});

	await stream.create({ contentType: "application/json" });
}

interface WriteAgentStreamOptions {
	sessionId: string;
	messageId: string;
	abortSignal?: AbortSignal;
}

export async function writeAgentStream(
	stream: ReadableStream<UIMessageChunk>,
	options: WriteAgentStreamOptions,
): Promise<void> {
	const { sessionId, messageId, abortSignal } = options;

	const durableStream = new DurableStream({
		url: streamUrl(sessionId),
		headers: getStreamHeaders(),
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
