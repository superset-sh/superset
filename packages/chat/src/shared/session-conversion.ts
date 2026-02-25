import type { MessageRole, WholeMessageChunk } from "../session-db/types";

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

interface JsonRecord {
	[key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function normalizeRole(value: string | undefined): MessageRole | null {
	if (!value) return null;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === "user" ||
		normalized === "assistant" ||
		normalized === "system"
	) {
		return normalized;
	}
	return null;
}

function toIsoTimestamp(value: unknown): string {
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value).toISOString();
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString();
		}
	}
	return DEFAULT_TIMESTAMP;
}

function extractTimestamp(record: JsonRecord): string {
	const candidates = [
		record.createdAt,
		record.created_at,
		record.timestamp,
		record.time,
		record.ts,
	];
	for (const candidate of candidates) {
		const parsed = toIsoTimestamp(candidate);
		if (parsed !== DEFAULT_TIMESTAMP) return parsed;
	}
	return DEFAULT_TIMESTAMP;
}

function extractText(value: unknown, depth = 0): string {
	if (depth > 6) return "";
	if (typeof value === "string") return value.trim();
	if (Array.isArray(value)) {
		return value
			.map((item) => extractText(item, depth + 1))
			.filter((part) => part.length > 0)
			.join("\n")
			.trim();
	}

	const record = asRecord(value);
	if (!record) return "";

	const directTextKeys = [
		"text",
		"delta",
		"value",
		"output_text",
		"input_text",
	];
	for (const key of directTextKeys) {
		const candidate = asString(record[key]);
		if (candidate && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}

	const nestedKeys = [
		"message",
		"content",
		"output",
		"input",
		"payload",
		"data",
		"result",
	];
	for (const key of nestedKeys) {
		const nested = extractText(record[key], depth + 1);
		if (nested.length > 0) {
			return nested;
		}
	}

	return "";
}

function parseSessionInput(input: string | unknown[]): unknown[] {
	if (Array.isArray(input)) return input;
	const trimmed = input.trim();
	if (!trimmed) return [];

	// Accept either JSON arrays or JSONL.
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// Fall through to JSONL parsing.
		}
	}

	return trimmed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return line;
			}
		});
}

function createWholeMessageChunk(params: {
	id: string;
	role: MessageRole;
	text: string;
	createdAt: string;
}): WholeMessageChunk {
	const { id, role, text, createdAt } = params;
	return {
		type: "whole-message",
		message: {
			id,
			role,
			parts: [{ type: "text", text }],
			createdAt,
		},
	};
}

function inferCodexRole(record: JsonRecord): MessageRole | null {
	const message = asRecord(record.message);
	const fromMessageRole = normalizeRole(
		asString(message?.role) ?? asString(message?.sender),
	);
	if (fromMessageRole) return fromMessageRole;

	const fromRole = normalizeRole(asString(record.role));
	if (fromRole) return fromRole;

	const type = asString(record.type)?.toLowerCase() ?? "";
	if (type.includes("user")) return "user";
	if (type.includes("assistant")) return "assistant";
	if (type.includes("system")) return "system";
	if (type.includes("agent_message") || type.includes("agent-response")) {
		return "assistant";
	}
	return null;
}

function inferClaudeRole(record: JsonRecord): MessageRole | null {
	const message = asRecord(record.message);
	const fromMessageRole = normalizeRole(asString(message?.role));
	if (fromMessageRole) return fromMessageRole;

	const fromRole = normalizeRole(asString(record.role));
	if (fromRole) return fromRole;

	return normalizeRole(asString(record.type));
}

function isCodexLifecycleEvent(record: JsonRecord): boolean {
	const type = asString(record.type)?.toLowerCase() ?? "";
	return type === "task_started" || type === "agent-turn-complete";
}

export interface SessionConverterConvertContext {
	entry: unknown;
	entryIndex: number;
}

export interface SessionConverter {
	id: string;
	detect: (entry: unknown) => boolean;
	convert: (
		context: SessionConverterConvertContext,
	) => WholeMessageChunk | null;
}

export interface ConvertExternalSessionOptions {
	input: string | unknown[];
	providerId?: string;
}

export interface ConvertExternalSessionResult {
	providerId: string;
	totalEntries: number;
	ignoredEntries: number;
	messages: WholeMessageChunk[];
}

export const codexSessionConverter: SessionConverter = {
	id: "codex",
	detect(entry) {
		const record = asRecord(entry);
		if (!record) return false;
		if (asString(record.kind) === "codex_event") return true;
		if (asString(record.provider)?.toLowerCase() === "codex") return true;
		return (
			typeof record.turn_id === "string" ||
			typeof record.turnId === "string" ||
			asString(record.dir) === "to_tui" ||
			asString(record.dir) === "from_tui"
		);
	},
	convert({ entry, entryIndex }) {
		const record = asRecord(entry);
		if (!record || isCodexLifecycleEvent(record)) return null;

		const role = inferCodexRole(record);
		if (!role) return null;

		const message = asRecord(record.message);
		const text = extractText(message ?? record.content ?? record);
		if (!text) return null;

		const turnId = asString(record.turn_id) ?? asString(record.turnId);
		const id = asString(message?.id) ?? turnId ?? `codex-${entryIndex}`;
		const createdAt =
			extractTimestamp(message ?? {}) !== DEFAULT_TIMESTAMP
				? extractTimestamp(message ?? {})
				: extractTimestamp(record);

		return createWholeMessageChunk({
			id,
			role,
			text,
			createdAt,
		});
	},
};

export const claudeCodeSessionConverter: SessionConverter = {
	id: "claude-code",
	detect(entry) {
		const record = asRecord(entry);
		if (!record) return false;

		const message = asRecord(record.message);
		const messageRole = normalizeRole(asString(message?.role));
		if (messageRole) return true;

		const typeRole = normalizeRole(asString(record.type));
		if (
			typeRole &&
			(record.message !== undefined || record.content !== undefined)
		) {
			return true;
		}

		return (
			(typeof record.parentUuid === "string" ||
				typeof record.parent_uuid === "string" ||
				typeof record.uuid === "string") &&
			extractText(record).length > 0
		);
	},
	convert({ entry, entryIndex }) {
		const record = asRecord(entry);
		if (!record) return null;

		const message = asRecord(record.message);
		const role = inferClaudeRole(record);
		if (!role) return null;

		const text = extractText(message ?? record.content ?? record);
		if (!text) return null;

		const id =
			asString(message?.id) ??
			asString(record.uuid) ??
			asString(record.id) ??
			`claude-${entryIndex}`;
		const createdAt =
			extractTimestamp(message ?? {}) !== DEFAULT_TIMESTAMP
				? extractTimestamp(message ?? {})
				: extractTimestamp(record);

		return createWholeMessageChunk({
			id,
			role,
			text,
			createdAt,
		});
	},
};

export class SessionConverterRegistry {
	private readonly converters = new Map<string, SessionConverter>();
	private readonly order: string[] = [];

	constructor(initialConverters: SessionConverter[] = []) {
		for (const converter of initialConverters) {
			this.register(converter);
		}
	}

	register(converter: SessionConverter): this {
		if (!this.converters.has(converter.id)) {
			this.order.push(converter.id);
		}
		this.converters.set(converter.id, converter);
		return this;
	}

	unregister(converterId: string): boolean {
		const removed = this.converters.delete(converterId);
		if (!removed) return false;
		const index = this.order.indexOf(converterId);
		if (index >= 0) this.order.splice(index, 1);
		return true;
	}

	list(): SessionConverter[] {
		return this.order
			.map((id) => this.converters.get(id))
			.filter((converter): converter is SessionConverter => Boolean(converter));
	}

	convert(
		options: ConvertExternalSessionOptions,
	): ConvertExternalSessionResult {
		const entries = parseSessionInput(options.input);
		const converter = this.resolveConverter(options.providerId, entries);
		const messages: WholeMessageChunk[] = [];
		let ignoredEntries = 0;

		for (const [entryIndex, entry] of entries.entries()) {
			const next = converter.convert({ entry, entryIndex });
			if (!next) {
				ignoredEntries += 1;
				continue;
			}
			messages.push(next);
		}

		return {
			providerId: converter.id,
			totalEntries: entries.length,
			ignoredEntries,
			messages,
		};
	}

	private resolveConverter(
		providerId: string | undefined,
		entries: unknown[],
	): SessionConverter {
		if (providerId) {
			const explicit = this.converters.get(providerId);
			if (!explicit) {
				throw new Error(`Unknown session provider: ${providerId}`);
			}
			return explicit;
		}

		const available = this.list();
		if (available.length === 0) {
			throw new Error("No session converters are registered");
		}

		let best: SessionConverter | null = null;
		let bestScore = -1;

		for (const converter of available) {
			const score = entries.reduce<number>(
				(total, entry) => total + (converter.detect(entry) ? 1 : 0),
				0,
			);
			if (score > bestScore) {
				best = converter;
				bestScore = score;
			}
		}

		if (!best || bestScore <= 0) {
			throw new Error(
				"Could not determine session provider. Pass providerId explicitly.",
			);
		}

		return best;
	}
}

export function createDefaultSessionConverterRegistry(): SessionConverterRegistry {
	return new SessionConverterRegistry([
		claudeCodeSessionConverter,
		codexSessionConverter,
	]);
}

export const defaultSessionConverterRegistry =
	createDefaultSessionConverterRegistry();

export function convertExternalSessionToChatChunks(
	options: ConvertExternalSessionOptions,
): ConvertExternalSessionResult {
	return defaultSessionConverterRegistry.convert(options);
}
