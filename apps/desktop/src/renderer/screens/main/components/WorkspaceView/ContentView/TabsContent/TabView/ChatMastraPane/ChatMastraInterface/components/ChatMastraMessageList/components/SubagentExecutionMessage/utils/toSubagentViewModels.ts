import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";

type MastraActiveSubagents = NonNullable<
	UseMastraChatDisplayReturn["activeSubagents"]
>;
type MastraActiveSubagent =
	MastraActiveSubagents extends Map<string, infer SubagentState>
		? SubagentState
		: never;

export type SubagentEntries = Array<[string, MastraActiveSubagent]>;

interface SubagentToolCall {
	name: string;
	isError: boolean;
}

export interface SubagentViewModel {
	toolCallId: string;
	agentType: string;
	task: string;
	modelId?: string;
	status: "running" | "completed" | "error";
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

function asStatus(
	value: unknown,
): "running" | "completed" | "error" | undefined {
	if (value === "running" || value === "completed" || value === "error") {
		return value;
	}
	return undefined;
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
		const status = asStatus(record?.status) ?? "running";
		const text =
			asString(status === "running" ? record?.textDelta : record?.result) ??
			asString(record?.textDelta) ??
			asString(record?.result) ??
			"";
		const durationMs =
			typeof record?.durationMs === "number" &&
			Number.isFinite(record.durationMs) &&
			record.durationMs >= 0
				? record.durationMs
				: undefined;

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
