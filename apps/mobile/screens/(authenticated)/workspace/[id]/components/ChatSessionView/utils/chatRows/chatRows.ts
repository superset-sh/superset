import type { OutboxEntry, TurnGroup } from "@superset/chat/core";
import type { Item, ToolCall, UserMessage } from "@superset/chat/protocol";

export type ChatRow =
	| { kind: "item"; key: string; item: Item }
	| { kind: "tool_run"; key: string; items: ToolCall[] }
	| {
			kind: "turn_status";
			key: string;
			status: "failed" | "interrupted";
			message: string | undefined;
	  }
	| { kind: "outbox"; key: string; entry: OutboxEntry }
	| { kind: "working"; key: string };

function itemKey(item: Item): string {
	return item.kind === "user_message"
		? ((item as UserMessage).clientId ?? item.id)
		: item.id;
}

function lastRowIsLive(group: TurnGroup): boolean {
	const entry = group.entries.at(-1);
	if (!entry) return false;
	if (entry.kind === "tool_run")
		return entry.items.some((item) => item.status === "running");
	const item = entry.item;
	if (item.kind === "tool_call") return (item as ToolCall).status === "running";
	if (item.kind === "agent_message" || item.kind === "reasoning")
		return item.completedAtMs === undefined;
	if (item.kind === "approval_request")
		return (item as { status: string }).status === "pending";
	return false;
}

/**
 * One flat list for the transcript. A user message is keyed by its client id
 * so the bubble sent from the outbox and its echo are the same row. A running
 * turn whose newest row does not animate on its own ends with a working line.
 */
export function chatRows(
	groups: readonly TurnGroup[],
	outbox: readonly OutboxEntry[],
): ChatRow[] {
	const rows: ChatRow[] = [];
	const echoed = new Set<string>();

	for (const group of groups) {
		group.entries.forEach((entry, index) => {
			if (entry.kind === "item") {
				if (entry.item.kind === "user_message") {
					const clientId = (entry.item as UserMessage).clientId;
					if (clientId) echoed.add(clientId);
				}
				rows.push({ kind: "item", key: itemKey(entry.item), item: entry.item });
				return;
			}
			rows.push({
				kind: "tool_run",
				key: `tools:${group.turnId}:${entry.items[0]?.id ?? index}`,
				items: entry.items,
			});
		});
		const turn = group.turn;
		if (turn?.status === "failed" || turn?.status === "interrupted") {
			rows.push({
				kind: "turn_status",
				key: `status:${group.turnId}`,
				status: turn.status,
				message: turn.error?.message,
			});
		}
	}

	const last = groups.at(-1);
	if (last?.turn?.status === "running" && !lastRowIsLive(last)) {
		rows.push({ kind: "working", key: `working:${last.turnId}` });
	}

	for (const entry of outbox) {
		if (echoed.has(entry.clientId)) continue;
		rows.push({ kind: "outbox", key: entry.clientId, entry });
	}
	return rows;
}

export function runningTurnId(groups: readonly TurnGroup[]): string | null {
	for (let index = groups.length - 1; index >= 0; index -= 1) {
		const turn = groups[index]?.turn;
		if (turn?.status === "running") return turn.id;
	}
	return null;
}
