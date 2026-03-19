import type { UseChatDisplayReturn } from "@superset/chat/client";

type ChatActiveSubagents = NonNullable<UseChatDisplayReturn["activeSubagents"]>;
type ChatActiveSubagent =
	ChatActiveSubagents extends Map<string, infer SubagentState>
		? SubagentState
		: never;

export type SubagentEntries = Array<[string, ChatActiveSubagent]>;
export type SubagentStatus = "running" | "completed" | "error";

interface SubagentToolCall {
	name: string;
	isError: boolean;
}

export interface SubagentViewModel {
	toolCallId: string;
	agentType: string;
	task: string;
	modelId?: string;
	status: SubagentStatus;
	text: string;
	durationMs?: number;
	toolCalls: SubagentToolCall[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asStatus(value: unknown): SubagentStatus | undefined {
	if (value === "running" || value === "completed" || value === "error") {
		return value;
	}
	return undefined;
}

function asDurationMs(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return value;
}

function hasErrorSignal(record: Record<string, unknown> | null): boolean {
	if (!record) return false;
	return record.isError === true || asString(record.error) !== null;
}

function hasCompletionSignal(record: Record<string, unknown> | null): boolean {
	if (!record) return false;
	return (
		record.result !== undefined || asDurationMs(record.durationMs) !== undefined
	);
}

export function inferSubagentStatus(subagent: unknown): SubagentStatus {
	const record = asRecord(subagent);
	const explicitStatus = asStatus(record?.status);
	if (explicitStatus) return explicitStatus;
	if (hasErrorSignal(record)) return "error";
	if (hasCompletionSignal(record)) return "completed";
	return "running";
}

export function isSubagentRunning(subagent: unknown): boolean {
	return inferSubagentStatus(subagent) === "running";
}

function toToolCalls(value: unknown): SubagentToolCall[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			const record = asRecord(item);
			if (!record) return null;
			const name = asString(record.name);
			if (!name) return null;
			return {
				name,
				isError: record.isError === true,
			};
		})
		.filter((item): item is SubagentToolCall => item !== null);
}

export function toSubagentViewModels(
	entries: SubagentEntries,
): SubagentViewModel[] {
	return entries.map(([toolCallId, subagent]) => {
		const record = asRecord(subagent);
		const durationMs = asDurationMs(record?.durationMs);
		const status = inferSubagentStatus(subagent);
		const text =
			asString(status === "running" ? record?.textDelta : record?.result) ??
			asString(record?.textDelta) ??
			asString(record?.result) ??
			"";

		return {
			toolCallId,
			agentType: asString(record?.agentType) ?? "subagent",
			task: asString(record?.task) ?? "Working on task...",
			modelId: asString(record?.modelId) ?? undefined,
			status,
			text,
			durationMs,
			toolCalls: toToolCalls(record?.toolCalls),
		};
	});
}
