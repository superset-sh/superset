/**
 * Message materialization from stream chunks.
 *
 * Handles two formats:
 * 1. User messages: Single row with {type: 'whole-message', message: UIMessage}
 * 2. Assistant messages: Multiple rows with AI SDK UIMessageChunks
 *
 * For assistant messages, we accumulate UIMessageChunks into UIMessageParts
 * following the AI SDK v6 chunk protocol.
 */

import type { UIMessage, UIMessageChunk } from "ai";
import type { ChunkRow } from "../../../schema";
import type {
	AnyUIMessagePart,
	DurableStreamChunk,
	MessageRole,
	MessageRow,
	WholeMessageChunk,
} from "../../../types";

// ============================================================================
// Type Guards
// ============================================================================

function isWholeMessageChunk(
	chunk: DurableStreamChunk | null,
): chunk is WholeMessageChunk {
	return chunk !== null && (chunk as { type: string }).type === "whole-message";
}

/**
 * Returns true if the chunk is a standard AI SDK UIMessageChunk
 * (not one of our custom durable stream types).
 */
function isUIMessageChunk(chunk: DurableStreamChunk): boolean {
	const t = (chunk as { type: string }).type;
	return (
		t !== "whole-message" &&
		t !== "config" &&
		t !== "control" &&
		t !== "approval-response" &&
		t !== "tool-result"
	);
}

// ============================================================================
// Chunk Parsing
// ============================================================================

/**
 * Parse a JSON-encoded chunk string.
 */
export function parseChunk(chunkJson: string): DurableStreamChunk | null {
	try {
		return JSON.parse(chunkJson) as DurableStreamChunk;
	} catch {
		return null;
	}
}

// ============================================================================
// Whole Message Materialization
// ============================================================================

function materializeWholeMessage(
	row: ChunkRow,
	chunk: WholeMessageChunk,
): MessageRow {
	const { message } = chunk;
	const createdAt = message.createdAt
		? new Date(message.createdAt as string | number)
		: new Date(row.createdAt);

	return {
		id: message.id,
		role: message.role as MessageRole,
		parts: message.parts as AnyUIMessagePart[],
		actorId: row.actorId,
		isComplete: true,
		createdAt,
		lastChunkAt: createdAt,
	};
}

// ============================================================================
// Streamed Message Materialization (AI SDK UIMessageChunk accumulator)
// ============================================================================

function materializeStreamedMessage(rows: ChunkRow[]): MessageRow {
	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	// biome-ignore lint: rows.length checked upstream
	const first = sorted[0]!;

	const parts: AnyUIMessagePart[] = [];
	// toolCallId → index in `parts` array
	const toolPartIndex = new Map<string, number>();
	// toolCallId → accumulated input text (for JSON.parse when complete)
	const toolInputText = new Map<string, string>();

	let isComplete = false;
	let currentTextId: string | null = null;
	let currentReasoningId: string | null = null;

	for (const row of sorted) {
		const chunk = parseChunk(row.chunk);
		if (!chunk || !isUIMessageChunk(chunk)) continue;

		const c = chunk as UIMessageChunk;

		switch (c.type) {
			// --- Text ---
			case "text-start":
				currentTextId = c.id;
				parts.push({ type: "text", text: "" });
				break;
			case "text-delta":
				if (currentTextId) {
					const last = parts[parts.length - 1];
					if (last?.type === "text") {
						(last as { type: "text"; text: string }).text += c.delta;
					}
				}
				break;
			case "text-end":
				currentTextId = null;
				break;

			// --- Tool input streaming ---
			case "tool-input-start": {
				const idx = parts.length;
				toolPartIndex.set(c.toolCallId, idx);
				toolInputText.set(c.toolCallId, "");
				parts.push({
					type: "dynamic-tool",
					toolName: c.toolName,
					toolCallId: c.toolCallId,
					state: "input-streaming",
					input: undefined,
					...(c.title ? { title: c.title } : {}),
					...(c.providerExecuted
						? { providerExecuted: c.providerExecuted }
						: {}),
				} as AnyUIMessagePart);
				break;
			}
			case "tool-input-delta": {
				const accumulated =
					(toolInputText.get(c.toolCallId) ?? "") + c.inputTextDelta;
				toolInputText.set(c.toolCallId, accumulated);
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					try {
						part.input = JSON.parse(accumulated);
					} catch {
						// Incomplete JSON — keep streaming
					}
				}
				break;
			}
			case "tool-input-available": {
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					part.state = "input-available";
					part.input = c.input;
					if (c.providerMetadata)
						part.callProviderMetadata = c.providerMetadata;
				} else {
					// No prior tool-input-start — create the part now
					const newIdx = parts.length;
					toolPartIndex.set(c.toolCallId, newIdx);
					parts.push({
						type: "dynamic-tool",
						toolName: c.toolName,
						toolCallId: c.toolCallId,
						state: "input-available",
						input: c.input,
						...(c.title ? { title: c.title } : {}),
						...(c.providerExecuted
							? { providerExecuted: c.providerExecuted }
							: {}),
						...(c.providerMetadata
							? { callProviderMetadata: c.providerMetadata }
							: {}),
					} as AnyUIMessagePart);
				}
				break;
			}
			case "tool-input-error": {
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					part.state = "input-available";
					part.input = c.input;
				}
				break;
			}
			case "tool-approval-request": {
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					part.state = "approval-requested";
					part.approval = { id: c.approvalId };
				}
				break;
			}
			case "tool-output-available": {
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					part.state = "output-available";
					part.output = c.output;
					if (c.preliminary) part.preliminary = c.preliminary;
				}
				break;
			}
			case "tool-output-error": {
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					part.state = "output-error";
					part.errorText = c.errorText;
				}
				break;
			}
			case "tool-output-denied": {
				const idx = toolPartIndex.get(c.toolCallId);
				if (idx !== undefined) {
					const part = parts[idx] as Record<string, unknown>;
					part.state = "output-denied";
				}
				break;
			}

			// --- Reasoning ---
			case "reasoning-start":
				currentReasoningId = c.id;
				parts.push({ type: "reasoning", text: "" });
				break;
			case "reasoning-delta":
				if (currentReasoningId) {
					const last = parts[parts.length - 1];
					if (last?.type === "reasoning") {
						(last as { type: "reasoning"; text: string }).text += c.delta;
					}
				}
				break;
			case "reasoning-end":
				currentReasoningId = null;
				break;

			// --- Source / File ---
			case "source-url":
				parts.push({
					type: "source-url",
					sourceId: c.sourceId,
					url: c.url,
					...(c.title ? { title: c.title } : {}),
					...(c.providerMetadata
						? { providerMetadata: c.providerMetadata }
						: {}),
				});
				break;
			case "source-document":
				parts.push({
					type: "source-document",
					sourceId: c.sourceId,
					mediaType: c.mediaType,
					title: c.title,
					...(c.filename ? { filename: c.filename } : {}),
					...(c.providerMetadata
						? { providerMetadata: c.providerMetadata }
						: {}),
				});
				break;
			case "file":
				parts.push({
					type: "file",
					url: c.url,
					mediaType: c.mediaType,
					...(c.providerMetadata
						? { providerMetadata: c.providerMetadata }
						: {}),
				});
				break;

			// --- Steps ---
			case "start-step":
				parts.push({ type: "step-start" });
				break;
			case "finish-step":
				// No corresponding UIMessagePart — skip
				break;

			// --- Stream lifecycle ---
			case "start":
				// No-op — metadata only
				break;
			case "finish":
				isComplete = true;
				break;
			case "abort":
				isComplete = true;
				break;
			case "error":
				parts.push({
					type: "error",
					text: c.errorText ?? "An error occurred",
				} as unknown as AnyUIMessagePart);
				break;
			case "message-metadata":
				// No-op
				break;

			default:
				// Unknown chunk type — skip
				break;
		}
	}

	const lastRow = sorted.at(-1) ?? first;
	return {
		id: first.messageId,
		role: first.role as MessageRole,
		parts,
		actorId: first.actorId,
		isComplete,
		createdAt: new Date(first.createdAt),
		lastChunkAt: new Date(lastRow.createdAt),
	};
}

// ============================================================================
// Main Materializer
// ============================================================================

/**
 * Materialize a MessageRow from collected chunk rows.
 *
 * Handles two formats:
 * 1. User messages: Single row with {type: 'whole-message', message: UIMessage}
 * 2. Assistant messages: Multiple rows with AI SDK UIMessageChunks
 */
export function materializeMessage(rows: ChunkRow[]): MessageRow {
	if (!rows || rows.length === 0) {
		throw new Error("Cannot materialize message from empty rows");
	}

	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	// biome-ignore lint: rows.length checked above
	const firstRow = sorted[0]!;
	const firstChunk = parseChunk(firstRow.chunk);

	if (!firstChunk) {
		throw new Error("Failed to parse first chunk");
	}

	if (isWholeMessageChunk(firstChunk)) {
		return materializeWholeMessage(firstRow, firstChunk);
	}

	return materializeStreamedMessage(sorted);
}

// ============================================================================
// Content Extraction Helpers
// ============================================================================

/**
 * Extract text content from a UIMessage or MessageRow.
 */
export function extractTextContent(message: {
	parts: Array<{ type: string; text?: string }>;
}): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text ?? "")
		.join("");
}

export function isUserMessage(row: MessageRow): boolean {
	return row.role === "user";
}

export function isAssistantMessage(row: MessageRow): boolean {
	return row.role === "assistant";
}

// ============================================================================
// UIMessage Conversion
// ============================================================================

/**
 * Convert a MessageRow to an AI SDK UIMessage.
 */
export function messageRowToUIMessage(
	row: MessageRow,
): UIMessage & { actorId: string; createdAt: Date } {
	return {
		id: row.id,
		role: row.role as "user" | "assistant",
		parts: row.parts,
		createdAt: row.createdAt,
		actorId: row.actorId,
	} as UIMessage & { actorId: string; createdAt: Date };
}
