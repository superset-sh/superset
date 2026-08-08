import { randomUUID } from "node:crypto";
import type {
	AgentMessage,
	Notice,
	Reasoning,
	ToolCall,
	ToolCallStatus,
	Turn,
	Usage,
} from "@superset/chat/protocol";
import type { AdapterEvent } from "../../types";
import type { ToolOutcome, ToolUse } from "../mapToolUse";
import { contentFor, locationsFor, titleFor, toolKindFor } from "../mapToolUse";

export const HARNESS_ID = "claude-code";

const IGNORED_SYSTEM_SUBTYPES = new Set([
	"status",
	"thinking_tokens",
	"recorder_abort",
	"task_started",
	"task_updated",
	"task_notification",
	"task_progress",
]);

const IGNORED_TYPES = new Set(["rate_limit_event", "user_replay"]);

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Json)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function usageFrom(raw: unknown): Usage | undefined {
	const usage = asObject(raw);
	if (!usage) return undefined;
	const number = (value: unknown): number =>
		typeof value === "number" ? value : 0;
	return {
		inputTokens:
			number(usage.input_tokens) + number(usage.cache_creation_input_tokens),
		cachedInputTokens: number(usage.cache_read_input_tokens),
		outputTokens: number(usage.output_tokens),
	};
}

type TrackedTool = ToolUse & {
	itemId: string;
	startedAtMs: number;
	parentItemId?: string;
};

export type ClaudeTranslatorOptions = {
	cwd: string;
	now?: () => number;
	mintId?: () => string;
};

export class ClaudeTranslator {
	private turnId: string | null = null;
	private turnStartedAtMs = 0;
	private readonly settledBlocks = new Map<string, number>();
	private readonly tools = new Map<string, TrackedTool>();
	private readonly declined = new Set<string>();
	private interruptReason: string | null = null;

	constructor(private readonly options: ClaudeTranslatorOptions) {}

	get currentTurnId(): string | null {
		return this.turnId;
	}

	markDeclined(toolUseId: string): void {
		this.declined.add(toolUseId);
	}

	markInterrupted(reason: string): void {
		this.interruptReason = reason;
	}

	translate(message: unknown): AdapterEvent[] {
		const envelope = asObject(message);
		if (!envelope) return [];
		const type = asString(envelope.type);
		if (!type || IGNORED_TYPES.has(type)) return [];

		switch (type) {
			case "system":
				return this.system(envelope);
			case "assistant":
				return this.assistant(envelope);
			case "user":
				return this.user(envelope);
			case "stream_event":
				return this.streamEvent(envelope);
			case "result":
				return this.result(envelope);
			default:
				return [this.notice("info", `Unmapped ${type} event`)];
		}
	}

	interrupt(reason: string): AdapterEvent[] {
		const events: AdapterEvent[] = [];
		const completedAtMs = this.now();

		for (const [toolUseId, tool] of [...this.tools]) {
			this.tools.delete(toolUseId);
			events.push(
				this.item({
					id: tool.itemId,
					kind: "tool_call",
					startedAtMs: tool.startedAtMs,
					completedAtMs,
					title: titleFor(tool, this.options.cwd),
					toolKind: toolKindFor(tool.name),
					toolName: tool.name,
					status: "canceled",
					content: contentFor(tool, null),
					rawInput: tool.input,
					...(tool.parentItemId ? { parentItemId: tool.parentItemId } : {}),
				}),
			);
		}

		if (this.turnId) {
			events.push({
				kind: "turn",
				turn: {
					id: this.turnId,
					status: "interrupted",
					error: { message: reason },
					startedAtMs: this.turnStartedAtMs,
					completedAtMs,
				},
			});
			this.turnId = null;
		}
		return events;
	}

	private system(envelope: Json): AdapterEvent[] {
		const subtype = asString(envelope.subtype) ?? "";
		if (IGNORED_SYSTEM_SUBTYPES.has(subtype)) return [];

		if (subtype === "init") {
			return [
				{
					kind: "session",
					session: {
						harness: HARNESS_ID,
						status: "running",
						...(asString(envelope.model)
							? { modelId: asString(envelope.model) as string }
							: {}),
					},
				},
			];
		}

		if (subtype === "compact_boundary") {
			return [this.notice("compaction", "Conversation history was compacted")];
		}

		return [this.notice("info", `Unmapped system event: ${subtype}`)];
	}

	private assistant(envelope: Json): AdapterEvent[] {
		const message = asObject(envelope.message);
		if (!message) return [];
		const messageId = asString(message.id) ?? this.mintId();
		const parentItemId = this.parentItemFor(envelope);
		const events = this.ensureTurn();

		for (const rawBlock of asArray(message.content)) {
			const block = asObject(rawBlock);
			if (!block) continue;
			const index = this.nextBlockIndex(messageId);
			const itemId = `${messageId}#${index}`;
			const startedAtMs = this.now();
			const blockType = asString(block.type);

			if (blockType === "text") {
				const item: AgentMessage = {
					id: itemId,
					kind: "agent_message",
					startedAtMs,
					completedAtMs: startedAtMs,
					text: asString(block.text) ?? "",
				};
				events.push(this.item(item, parentItemId));
				continue;
			}

			if (blockType === "thinking") {
				const item: Reasoning = {
					id: itemId,
					kind: "reasoning",
					startedAtMs,
					completedAtMs: startedAtMs,
					text: asString(block.thinking) ?? "",
				};
				events.push(this.item(item, parentItemId));
				continue;
			}

			if (blockType === "tool_use") {
				const toolUseId = asString(block.id) ?? itemId;
				const use: ToolUse = {
					id: toolUseId,
					name: asString(block.name) ?? "unknown",
					input: asObject(block.input) ?? {},
				};
				this.tools.set(toolUseId, {
					...use,
					itemId: toolUseId,
					startedAtMs,
					...(parentItemId ? { parentItemId } : {}),
				});
				events.push(
					this.item(
						this.toolCall(use, startedAtMs, "running", null),
						parentItemId,
					),
				);
				continue;
			}

			events.push(
				this.notice(
					"info",
					`Unmapped content block: ${blockType ?? "unknown"}`,
				),
			);
		}

		return events;
	}

	private user(envelope: Json): AdapterEvent[] {
		const message = asObject(envelope.message);
		if (!message) return [];
		const events: AdapterEvent[] = [];

		for (const rawBlock of asArray(message.content)) {
			const block = asObject(rawBlock);
			if (!block || asString(block.type) !== "tool_result") continue;

			const toolUseId = asString(block.tool_use_id) ?? "";
			const tool = this.tools.get(toolUseId);
			if (!tool) continue;
			this.tools.delete(toolUseId);

			const isError = block.is_error === true;
			const outcome: ToolOutcome = {
				rawOutput: envelope.tool_use_result ?? null,
				modelFacingText:
					asString(block.content) ??
					asArray(block.content)
						.map((part) => asString(asObject(part)?.text) ?? "")
						.join(""),
				isError,
			};

			const status: ToolCallStatus = this.declined.has(toolUseId)
				? "declined"
				: isError
					? "failed"
					: "completed";
			this.declined.delete(toolUseId);

			events.push(
				this.item(
					this.toolCall(tool, tool.startedAtMs, status, outcome),
					tool.parentItemId,
				),
			);
		}

		return events;
	}

	private streamEvent(envelope: Json): AdapterEvent[] {
		const event = asObject(envelope.event);
		if (!event) return [];
		const eventType = asString(event.type);

		if (eventType === "message_start") {
			const message = asObject(event.message);
			const messageId = asString(message?.id);
			if (messageId) this.settledBlocks.set(messageId, 0);
			this.currentMessageId = messageId ?? this.currentMessageId;
			return this.ensureTurn();
		}

		if (eventType === "content_block_start") {
			const index = typeof event.index === "number" ? event.index : 0;
			const block = asObject(event.content_block);
			const toolUseId =
				asString(block?.type) === "tool_use" ? asString(block?.id) : null;
			this.streamingBlocks.set(
				index,
				toolUseId ?? `${this.currentMessageId}#${index}`,
			);
			return [];
		}

		if (eventType !== "content_block_delta") return [];

		const delta = asObject(event.delta);
		const index = typeof event.index === "number" ? event.index : 0;
		const itemId = this.streamingBlocks.get(index);
		if (!delta || !itemId) return [];

		const deltaType = asString(delta.type);
		if (deltaType === "text_delta" || deltaType === "thinking_delta") {
			const append = asString(delta.text) ?? asString(delta.thinking) ?? "";
			if (!append) return [];
			return [{ kind: "delta", delta: { type: "text", itemId, append } }];
		}

		if (deltaType === "input_json_delta") {
			const append = asString(delta.partial_json) ?? "";
			if (!append) return [];
			return [{ kind: "delta", delta: { type: "tool_input", itemId, append } }];
		}

		return [];
	}

	private sessionIdle(): AdapterEvent {
		return { kind: "session", session: { status: "idle" } };
	}

	private result(envelope: Json): AdapterEvent[] {
		if (!this.turnId) return [];

		const interruptReason = this.interruptReason;
		if (interruptReason !== null) {
			this.interruptReason = null;
			this.settledBlocks.clear();
			this.streamingBlocks.clear();
			return [...this.interrupt(interruptReason), this.sessionIdle()];
		}

		const completedAtMs = this.now();
		const isError = envelope.is_error === true;
		const usage = usageFrom(envelope.usage);
		const cost =
			typeof envelope.total_cost_usd === "number"
				? envelope.total_cost_usd
				: undefined;

		const turn: Turn = {
			id: this.turnId,
			status: isError ? "failed" : "completed",
			startedAtMs: this.turnStartedAtMs,
			completedAtMs,
			...(usage
				? {
						usage: {
							...usage,
							...(cost === undefined ? {} : { costUsd: cost }),
						},
					}
				: {}),
			...(isError
				? { error: { message: asString(envelope.subtype) ?? "error" } }
				: {}),
		};
		this.turnId = null;
		this.settledBlocks.clear();
		this.streamingBlocks.clear();
		return [{ kind: "turn", turn }, this.sessionIdle()];
	}

	private currentMessageId = "";
	private readonly streamingBlocks = new Map<number, string>();

	private ensureTurn(): AdapterEvent[] {
		if (this.turnId) return [];
		this.turnId = this.mintId();
		this.turnStartedAtMs = this.now();
		return [
			{
				kind: "turn",
				turn: {
					id: this.turnId,
					status: "running",
					startedAtMs: this.turnStartedAtMs,
				},
			},
		];
	}

	private toolCall(
		use: ToolUse,
		startedAtMs: number,
		status: ToolCallStatus,
		outcome: ToolOutcome | null,
	): ToolCall {
		return {
			id: use.id,
			kind: "tool_call",
			startedAtMs,
			...(status === "running" ? {} : { completedAtMs: this.now() }),
			title: titleFor(use, this.options.cwd),
			toolKind: toolKindFor(use.name),
			toolName: use.name,
			status,
			content: contentFor(use, outcome),
			...(locationsFor(use) ? { locations: locationsFor(use) } : {}),
			rawInput: use.input,
			...(outcome ? { rawOutput: outcome.rawOutput } : {}),
		};
	}

	private parentItemFor(envelope: Json): string | undefined {
		return asString(envelope.parent_tool_use_id) ?? undefined;
	}

	private nextBlockIndex(messageId: string): number {
		const next = this.settledBlocks.get(messageId) ?? 0;
		this.settledBlocks.set(messageId, next + 1);
		return next;
	}

	private item(
		item: AgentMessage | Reasoning | ToolCall | Notice,
		parentItemId?: string,
	): AdapterEvent {
		return {
			kind: "item",
			item: parentItemId ? { ...item, parentItemId } : item,
			turnId: this.turnId ?? "unattributed",
		};
	}

	private notice(noticeKind: Notice["noticeKind"], text: string): AdapterEvent {
		return this.item({
			id: this.mintId(),
			kind: "notice",
			startedAtMs: this.now(),
			noticeKind,
			text,
		});
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}

	private mintId(): string {
		return (this.options.mintId ?? randomUUID)();
	}
}
