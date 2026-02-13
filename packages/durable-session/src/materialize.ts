import type { StreamChunk, UIMessage } from "@tanstack/ai";
import { StreamProcessor } from "@tanstack/ai";
import { createTextSegmentEnricher } from "./enrich-text-segments";
import type { ChunkRow } from "./schema";
import type {
	DurableStreamChunk,
	MessageRole,
	MessageRow,
	WholeMessageChunk,
} from "./types";

function isDoneChunk(chunk: StreamChunk): boolean {
	return chunk.type === "RUN_FINISHED";
}

function isWholeMessageChunk(
	chunk: DurableStreamChunk | null,
): chunk is WholeMessageChunk {
	return chunk !== null && chunk.type === "whole-message";
}

export function parseChunk(chunkJson: string): DurableStreamChunk | null {
	try {
		return JSON.parse(chunkJson) as DurableStreamChunk;
	} catch {
		return null;
	}
}

function materializeWholeMessage(
	row: ChunkRow,
	chunk: WholeMessageChunk,
): MessageRow {
	const { message } = chunk;

	return {
		id: message.id,
		role: message.role as MessageRole,
		parts: message.parts,
		actorId: row.actorId,
		isComplete: true,
		createdAt: message.createdAt
			? new Date(message.createdAt)
			: new Date(row.createdAt),
	};
}

function materializeAssistantMessage(rows: ChunkRow[]): MessageRow {
	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	const first = sorted[0] as ChunkRow;

	const processor = new StreamProcessor();
	processor.startAssistantMessage();

	let isComplete = false;
	const enrichChunk = createTextSegmentEnricher();

	for (const row of sorted) {
		const chunk = parseChunk(row.chunk);
		if (!chunk) continue;

		const type = (chunk as { type: string }).type as string;

		if (type === "message-start" || type === "message-end") {
			if (type === "message-end") {
				isComplete = true;
			}
			continue;
		}

		if (isWholeMessageChunk(chunk)) continue;

		try {
			processor.processChunk(
				enrichChunk(chunk as StreamChunk & { [key: string]: unknown }),
			);
		} catch (err) {
			console.debug("[materialize] processChunk error:", err);
		}

		if (isDoneChunk(chunk as StreamChunk)) {
			isComplete = true;
		}

		if (type === "stop" || type === "error" || type === "RUN_ERROR") {
			isComplete = true;
		}
	}

	if (isComplete) {
		processor.finalizeStream();
	}

	const messages = processor.getMessages();
	const message = messages[messages.length - 1];
	const parts = message?.parts ?? [];

	return {
		id: first.messageId,
		role: first.role as MessageRole,
		parts,
		actorId: first.actorId,
		isComplete,
		createdAt: new Date(first.createdAt),
	};
}

export function materializeMessage(rows: ChunkRow[]): MessageRow {
	if (!rows || rows.length === 0) {
		throw new Error("Cannot materialize message from empty rows");
	}

	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	const firstRow = sorted[0] as ChunkRow;
	const firstChunk = parseChunk(firstRow.chunk);

	if (!firstChunk) {
		throw new Error("Failed to parse first chunk");
	}

	if (isWholeMessageChunk(firstChunk)) {
		return materializeWholeMessage(firstRow, firstChunk);
	}

	return materializeAssistantMessage(sorted);
}

export function extractTextContent(message: {
	parts: Array<{ type: string; text?: string; content?: string }>;
}): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text ?? p.content ?? "")
		.join("");
}

export function isUserMessage(row: MessageRow): boolean {
	return row.role === "user";
}

export function isAssistantMessage(row: MessageRow): boolean {
	return row.role === "assistant";
}

export function messageRowToUIMessage(
	row: MessageRow,
): UIMessage & { actorId: string } {
	return {
		id: row.id,
		role: row.role,
		parts: row.parts,
		createdAt: row.createdAt,
		actorId: row.actorId,
	};
}
