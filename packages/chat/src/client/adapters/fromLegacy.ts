/**
 * Adapter: legacy tRPC `chat.listMessages` output → new v2 chat domain model.
 *
 * The legacy shape bundles content (text, image, file, tool_call, tool_result,
 * thinking) into a single `content[]` array per message. The new model
 * (see @superset/chat/shared types.ts) keeps Parts flat and keyed by
 * messageID, and treats tool calls as a single ToolPart with a
 * discriminated state union rather than a call/result pair.
 *
 * This adapter is deliberately structural — it accepts any input matching
 * the LegacyMessage shape so tests can pass synthetic fixtures without
 * dragging in tRPC types. The real call site reads
 * `UseChatDisplayReturn["messages"]` which matches this shape.
 *
 * See plans/20260421-v2-chat-refactor-phased-plan.md Phase 1.
 */

import type {
	AssistantMessage,
	Message,
	Part,
	SessionStatus,
	TextPart,
	ToolPart,
	ToolState,
	UserMessage,
} from "../../shared/types";

// ---------------------------------------------------------------------------
// Legacy input shape (structural — matches the tRPC router output)
// ---------------------------------------------------------------------------

export interface LegacyTextContent {
	type: "text";
	text: string;
}

export interface LegacyImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface LegacyFileContent {
	type: "file";
	data: string;
	mediaType: string;
	filename?: string;
}

export interface LegacyToolCallContent {
	type: "tool_call";
	id: string;
	name: string;
	args: unknown;
}

export interface LegacyToolResultContent {
	type: "tool_result";
	id: string;
	name?: string;
	result: unknown;
	isError?: boolean;
}

export interface LegacyThinkingContent {
	type: "thinking";
	text: string;
}

export type LegacyContent =
	| LegacyTextContent
	| LegacyImageContent
	| LegacyFileContent
	| LegacyToolCallContent
	| LegacyToolResultContent
	| LegacyThinkingContent;

export interface LegacyMessage {
	id: string;
	role: "user" | "assistant" | string;
	content: LegacyContent[];
	createdAt: Date | string | number;
	stopReason?: string;
	errorMessage?: string;
	/** Model metadata if present (assistant messages). */
	model?: string;
	provider?: string;
}

export interface FromLegacyOptions {
	sessionID: string;
	/** Whether this session is currently streaming an assistant turn. */
	isStreaming?: boolean;
	/** ID of the message currently being streamed, if any. */
	activeMessageID?: string;
}

export interface FromLegacyResult {
	messages: Message[];
	parts: { [messageID: string]: Part[] };
	/** Session status derived from stream state + trailing error. */
	status: SessionStatus;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function fromLegacyMessages(
	legacy: LegacyMessage[],
	options: FromLegacyOptions,
): FromLegacyResult {
	// Drop the legacy hook's local optimistic user message when the real
	// server-side user message has already landed in the same array. The
	// legacy hook clears its own optimistic via a useEffect, but that
	// effect runs after render, so there is one frame where both are
	// present. Without this filter, the new Timeline shows the user's
	// message twice for that frame (and longer if clears race).
	const deduped = dedupeOptimisticUserMessages(legacy);

	// Collapse any id-duplicates the upstream view ended up with. The
	// useWorkspaceChatDisplay dual-write also guards against appending
	// `currentMessage` when it's already in `messages`, but a defensive
	// pass here catches any other dupes — last occurrence wins.
	const byId = new Map<string, number>();
	const uniq: LegacyMessage[] = [];
	for (const m of deduped) {
		const prevIdx = byId.get(m.id);
		if (prevIdx !== undefined) {
			uniq[prevIdx] = m;
			continue;
		}
		byId.set(m.id, uniq.length);
		uniq.push(m);
	}

	const messages: Message[] = [];
	const parts: { [messageID: string]: Part[] } = {};

	let lastUserID: string | null = null;

	for (const legacyMsg of uniq) {
		if (legacyMsg.role === "user") {
			const user = toUserMessage(legacyMsg, options.sessionID);
			messages.push(user);
			parts[user.id] = toUserParts(legacyMsg, user.id, options.sessionID);
			lastUserID = user.id;
			continue;
		}

		if (legacyMsg.role === "assistant") {
			const parent = lastUserID;
			if (!parent) {
				// Assistant with no preceding user message — skip in strict mode,
				// but to preserve parity we still emit with a synthetic parentID.
				const synthetic = toAssistantMessage(
					legacyMsg,
					options.sessionID,
					"",
				);
				messages.push(synthetic);
				parts[synthetic.id] = toAssistantParts(
					legacyMsg,
					synthetic.id,
					options.sessionID,
					options,
				);
				continue;
			}
			const asst = toAssistantMessage(legacyMsg, options.sessionID, parent);
			messages.push(asst);
			parts[asst.id] = toAssistantParts(
				legacyMsg,
				asst.id,
				options.sessionID,
				options,
			);
		}
		// Other roles (system, tool) are dropped — the v2 model does not
		// render them as messages; any relevant state is surfaced as parts
		// or docks.
	}

	return {
		messages,
		parts,
		status: deriveStatus(legacy, options),
	};
}

// ---------------------------------------------------------------------------
// Message-level translators
// ---------------------------------------------------------------------------

function toUserMessage(
	legacy: LegacyMessage,
	sessionID: string,
): UserMessage {
	return {
		id: legacy.id,
		sessionID,
		role: "user",
		time: { created: toEpoch(legacy.createdAt) },
	};
}

function toAssistantMessage(
	legacy: LegacyMessage,
	sessionID: string,
	parentID: string,
): AssistantMessage {
	const errored =
		legacy.stopReason === "error" || typeof legacy.errorMessage === "string";
	const completed =
		legacy.stopReason !== undefined && legacy.stopReason !== "error";

	const base: AssistantMessage = {
		id: legacy.id,
		sessionID,
		role: "assistant",
		parentID,
		modelID: legacy.model ?? "unknown",
		providerID: legacy.provider ?? "unknown",
		time: {
			created: toEpoch(legacy.createdAt),
			...(completed ? { completed: toEpoch(legacy.createdAt) } : {}),
		},
	};

	if (errored && typeof legacy.errorMessage === "string") {
		return {
			...base,
			error: {
				message: legacy.errorMessage,
				kind: legacy.stopReason === "error" ? "unknown" : undefined,
			},
		};
	}
	return base;
}

// ---------------------------------------------------------------------------
// Part translators
// ---------------------------------------------------------------------------

function toUserParts(
	legacy: LegacyMessage,
	messageID: string,
	sessionID: string,
): Part[] {
	const parts: Part[] = [];
	const at = toEpoch(legacy.createdAt);
	let index = 0;

	for (const content of legacy.content) {
		const partID = `${messageID}:p${index++}`;
		const basePart = {
			id: partID,
			messageID,
			sessionID,
			time: { start: at, end: at },
		};

		if (content.type === "text") {
			parts.push({ ...basePart, type: "text", text: content.text });
		} else if (content.type === "image") {
			parts.push({
				...basePart,
				type: "image",
				mime: content.mimeType,
				url: dataUrl(content.mimeType, content.data),
			});
		} else if (content.type === "file") {
			parts.push({
				...basePart,
				type: "file",
				path: content.filename ?? "",
				url: dataUrl(content.mediaType, content.data),
				mime: content.mediaType,
			});
		}
		// user messages should not carry tool_call / tool_result / thinking;
		// drop anything unexpected.
	}
	return parts;
}

function toAssistantParts(
	legacy: LegacyMessage,
	messageID: string,
	sessionID: string,
	options: FromLegacyOptions,
): Part[] {
	const parts: Part[] = [];
	const at = toEpoch(legacy.createdAt);
	const isStreamingThisMessage =
		options.isStreaming === true && options.activeMessageID === messageID;
	let index = 0;

	for (let i = 0; i < legacy.content.length; i++) {
		const content = legacy.content[i];
		if (!content) continue;
		const partID = `${messageID}:p${index++}`;
		const basePart = {
			id: partID,
			messageID,
			sessionID,
			time: {
				start: at,
				...(isStreamingThisMessage ? {} : { end: at }),
			},
		};

		if (content.type === "text") {
			const textPart: TextPart = {
				...basePart,
				type: "text",
				text: content.text,
			};
			parts.push(textPart);
		} else if (content.type === "thinking") {
			parts.push({ ...basePart, type: "reasoning", text: content.text });
		} else if (content.type === "image") {
			parts.push({
				...basePart,
				type: "image",
				mime: content.mimeType,
				url: dataUrl(content.mimeType, content.data),
			});
		} else if (content.type === "file") {
			parts.push({
				...basePart,
				type: "file",
				path: content.filename ?? "",
				url: dataUrl(content.mediaType, content.data),
				mime: content.mediaType,
			});
		} else if (content.type === "tool_call") {
			const result = findResultAfter(legacy.content, i, content.id);
			const state = deriveToolState({
				input: content.args,
				result,
				isStreaming: isStreamingThisMessage,
			});
			const toolPart: ToolPart = {
				...basePart,
				type: "tool",
				tool: content.name,
				state,
			};
			parts.push(toolPart);
		}
		// tool_result is consumed by its paired tool_call above; if the
		// server ever emits an orphan tool_result we drop it.
	}

	return parts;
}

function findResultAfter(
	content: LegacyContent[],
	start: number,
	toolCallID: string,
): LegacyToolResultContent | null {
	for (let i = start + 1; i < content.length; i++) {
		const part = content[i];
		if (part?.type === "tool_result" && part.id === toolCallID) {
			return part;
		}
	}
	return null;
}

/**
 * Map legacy tool-call state to the new discriminated ToolState union.
 *
 * Legacy derivation (ref AssistantMessage.tsx:78-89):
 *   result.isError → "output-error"
 *   result present → "output-available"
 *   isStreaming    → "input-streaming"
 *   otherwise      → "input-available" (running)
 */
export function deriveToolState(input: {
	input: unknown;
	result: LegacyToolResultContent | null;
	isStreaming: boolean;
}): ToolState {
	if (input.result) {
		if (input.result.isError) {
			return {
				kind: "error",
				input: input.input,
				error: { message: errorMessageFrom(input.result.result) },
				output: input.result.result,
			};
		}
		return {
			kind: "completed",
			input: input.input,
			output: input.result.result,
		};
	}
	if (input.isStreaming) {
		return { kind: "input-streaming", input: input.input };
	}
	return { kind: "running", input: input.input };
}

function errorMessageFrom(result: unknown): string {
	if (typeof result === "string") return result;
	if (result && typeof result === "object") {
		const maybe = (result as { message?: unknown; error?: unknown }).message;
		if (typeof maybe === "string") return maybe;
		const err = (result as { error?: unknown }).error;
		if (typeof err === "string") return err;
	}
	return "Tool failed";
}

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

function deriveStatus(
	legacy: LegacyMessage[],
	options: FromLegacyOptions,
): SessionStatus {
	if (options.isStreaming) return { type: "busy" };
	return { type: "idle" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEpoch(value: Date | string | number): number {
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number") return value;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function dataUrl(mime: string, data: string): string {
	// If it already looks like a URL, pass through; otherwise wrap as base64.
	if (data.startsWith("data:") || data.startsWith("http")) return data;
	return `data:${mime};base64,${data}`;
}

/**
 * Drop any user message whose id is prefixed with `optimistic-` if another
 * user message in the same list has identical text content. Legacy
 * display-hook clears the optimistic via a useEffect, which fires a frame
 * later than the first render where the real message has arrived — this
 * bridges that gap so the new timeline never shows a duplicate.
 */
export function dedupeOptimisticUserMessages(
	legacy: LegacyMessage[],
): LegacyMessage[] {
	// Pre-compute the text signature of every real user message once.
	const realUserTexts = new Set<string>();
	for (const m of legacy) {
		if (m.role !== "user") continue;
		if (isOptimisticId(m.id)) continue;
		realUserTexts.add(userMessageText(m));
	}
	if (realUserTexts.size === 0) return legacy;

	const filtered: LegacyMessage[] = [];
	for (const m of legacy) {
		if (
			m.role === "user" &&
			isOptimisticId(m.id) &&
			realUserTexts.has(userMessageText(m))
		) {
			continue;
		}
		filtered.push(m);
	}
	return filtered;
}

function isOptimisticId(id: string): boolean {
	return id.startsWith("optimistic-") || id.startsWith("opt-");
}

function userMessageText(m: LegacyMessage): string {
	return m.content
		.map((part) => {
			if (part.type === "text") return part.text;
			return "";
		})
		.join("");
}
