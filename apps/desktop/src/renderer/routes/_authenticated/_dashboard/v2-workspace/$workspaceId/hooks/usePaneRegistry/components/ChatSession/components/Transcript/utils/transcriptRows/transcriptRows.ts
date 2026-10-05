import type { OutboxEntry, TurnGroup } from "@superset/chat/core";
import type { Item, ToolCall, UserMessage } from "@superset/chat/protocol";

export type TranscriptRow =
	| {
			kind: "working";
			key: string;
			groupStart: boolean;
			startedAtMs: number;
			completedAtMs: number | undefined;
	  }
	| { kind: "item"; key: string; groupStart: boolean; item: Item }
	| { kind: "outbox"; key: string; groupStart: boolean; entry: OutboxEntry }
	| {
			kind: "tool_run";
			key: string;
			groupStart: boolean;
			items: ToolCall[];
			defaultCollapsed: boolean;
	  }
	| {
			kind: "turn_status";
			key: string;
			groupStart: boolean;
			status: "failed" | "interrupted";
			message: string | undefined;
	  };

function itemKey(item: Item): string {
	return item.kind === "user_message"
		? ((item as UserMessage).clientId ?? item.id)
		: item.id;
}

export function transcriptRows(
	groups: readonly TurnGroup[],
	outbox: readonly OutboxEntry[],
	pendingApprovalTargets: ReadonlySet<string>,
): TranscriptRow[] {
	const rows: TranscriptRow[] = [];
	const echoedClientIds = new Set<string>();

	for (const group of groups) {
		let groupStart = true;
		const push = (row: TranscriptRow) => {
			rows.push(row);
			groupStart = false;
		};
		const turn = group.turn;
		let clockPlaced = turn === null;
		const placeClock = () => {
			if (clockPlaced || !turn) return;
			clockPlaced = true;
			push({
				kind: "working",
				key: `working:${group.turnId}`,
				groupStart,
				startedAtMs: turn.startedAtMs,
				completedAtMs: turn.completedAtMs,
			});
		};
		const turnSettled = turn !== null && turn.status !== "running";
		group.entries.forEach((entry, index) => {
			if (entry.kind !== "item" || entry.item.kind !== "user_message") {
				placeClock();
			}
			if (entry.kind === "item") {
				const clientId =
					entry.item.kind === "user_message"
						? (entry.item as UserMessage).clientId
						: undefined;
				if (clientId) echoedClientIds.add(clientId);
				push({
					kind: "item",
					key: itemKey(entry.item),
					groupStart,
					item: entry.item,
				});
				return;
			}
			push({
				kind: "tool_run",
				key: `tools:${group.turnId}:${entry.items[0]?.id ?? index}`,
				groupStart,
				items: entry.items,
				defaultCollapsed:
					turnSettled &&
					!entry.items.some((tool) => pendingApprovalTargets.has(tool.id)),
			});
		});
		placeClock();
		if (turn?.status === "failed" || turn?.status === "interrupted") {
			push({
				kind: "turn_status",
				key: `status:${group.turnId}`,
				groupStart,
				status: turn.status,
				message: turn.error?.message,
			});
		}
	}

	for (const entry of outbox) {
		if (echoedClientIds.has(entry.clientId)) continue;
		rows.push({ kind: "outbox", key: entry.clientId, groupStart: true, entry });
	}
	return rows;
}
