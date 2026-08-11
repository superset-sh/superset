import type { Turn } from "../../protocol/envelope";
import type { ApprovalRequest, Item, ToolCall } from "../../protocol/items";
import type { SessionSnapshot, StoredItem } from "../reducer/reducer";

export type TimelineEntry =
	| { kind: "item"; item: Item }
	| { kind: "tool_run"; items: ToolCall[] };

export type TurnGroup = {
	turn: Turn | null;
	turnId: string;
	entries: TimelineEntry[];
};

function byStartThenId(a: Item, b: Item): number {
	if (a.startedAtMs !== b.startedAtMs) return a.startedAtMs - b.startedAtMs;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isSettledToolCall(item: Item): item is ToolCall {
	return item.kind === "tool_call" && (item as ToolCall).status !== "running";
}

export function collapseWorkLog(items: readonly Item[]): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	let run: ToolCall[] = [];

	const flush = () => {
		if (run.length === 0) return;
		if (run.length === 1)
			entries.push({ kind: "item", item: run[0] as ToolCall });
		else entries.push({ kind: "tool_run", items: run });
		run = [];
	};

	for (const item of items) {
		if (isSettledToolCall(item)) {
			run.push(item);
			continue;
		}
		flush();
		entries.push({ kind: "item", item });
	}
	flush();
	return entries;
}

export function deriveTimeline(snapshot: SessionSnapshot): TurnGroup[] {
	const itemsByTurn = new Map<string, Item[]>();
	for (const stored of snapshot.items.values() as Iterable<StoredItem>) {
		const bucket = itemsByTurn.get(stored.turnId);
		if (bucket) bucket.push(stored.item);
		else itemsByTurn.set(stored.turnId, [stored.item]);
	}

	const groups: TurnGroup[] = [];
	for (const [turnId, items] of itemsByTurn) {
		items.sort(byStartThenId);
		groups.push({
			turn: snapshot.turns.get(turnId) ?? null,
			turnId,
			entries: collapseWorkLog(items),
		});
	}

	groups.sort((a, b) => {
		const aStart = a.turn?.startedAtMs ?? firstItemStart(a);
		const bStart = b.turn?.startedAtMs ?? firstItemStart(b);
		if (aStart !== bStart) return aStart - bStart;
		return a.turnId < b.turnId ? -1 : a.turnId > b.turnId ? 1 : 0;
	});
	return groups;
}

function firstItemStart(group: TurnGroup): number {
	const first = group.entries[0];
	if (!first) return Number.MAX_SAFE_INTEGER;
	return first.kind === "item"
		? first.item.startedAtMs
		: (first.items[0]?.startedAtMs ?? Number.MAX_SAFE_INTEGER);
}

export function derivePendingApprovals(
	snapshot: SessionSnapshot,
): ApprovalRequest[] {
	const pending: ApprovalRequest[] = [];
	for (const stored of snapshot.items.values()) {
		const item = stored.item;
		if (item.kind === "approval_request") {
			const approval = item as ApprovalRequest;
			if (approval.status === "pending") pending.push(approval);
		}
	}
	pending.sort(byStartThenId);
	return pending;
}
