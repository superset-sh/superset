import {
	type OutboxEntry,
	type TurnGroup,
	toolRunKey,
	transcriptItemKey,
} from "@superset/chat/core";
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
	| { kind: "working"; key: string }
	| { kind: "activity"; key: string; rows: ChatRow[] };

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
				rows.push({
					kind: "item",
					key: transcriptItemKey(entry.item),
					item: entry.item,
				});
				return;
			}
			rows.push({
				kind: "tool_run",
				key: toolRunKey(group.turnId, entry.items, index),
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

function isActivity(row: ChatRow): boolean {
	if (row.kind === "tool_run") return true;
	if (row.kind !== "item") return false;
	return row.item.kind === "tool_call" || row.item.kind === "reasoning";
}

export function isActivityLive(rows: readonly ChatRow[]): boolean {
	return rows.some((row) => {
		if (row.kind === "tool_run")
			return row.items.some((item) => item.status === "running");
		if (row.kind !== "item") return false;
		if (row.item.kind === "tool_call")
			return (row.item as ToolCall).status === "running";
		return row.item.completedAtMs === undefined;
	});
}

export function activityStepCount(rows: readonly ChatRow[]): number {
	return rows.reduce(
		(count, row) => count + (row.kind === "tool_run" ? row.items.length : 1),
		0,
	);
}

function isAgentMessage(row: ChatRow): boolean {
	return row.kind === "item" && row.item.kind === "agent_message";
}

function foldRun(run: ChatRow[]): ChatRow[] {
	const [first] = run;
	if (!first) return [];
	if (!run.some(isActivity)) return run;
	return [{ kind: "activity", key: `activity:${first.key}`, rows: run }];
}

/**
 * Folds the agent's work between two prompts into one row, keeping only its
 * latest message on screen. Steps after that message fold into a second row.
 */
export function groupActivity(rows: readonly ChatRow[]): ChatRow[] {
	const grouped: ChatRow[] = [];
	let run: ChatRow[] = [];
	const flush = () => {
		const lastMessage = run.findLastIndex(isAgentMessage);
		const message = run[lastMessage];
		if (message) {
			grouped.push(...foldRun(run.slice(0, lastMessage)), message);
			grouped.push(...foldRun(run.slice(lastMessage + 1)));
		} else {
			grouped.push(...foldRun(run));
		}
		run = [];
	};
	for (const row of rows) {
		if (isActivity(row) || isAgentMessage(row)) {
			run.push(row);
			continue;
		}
		flush();
		grouped.push(row);
	}
	flush();
	return grouped;
}

type RowSide = "user" | "agent" | "system";

export type GroupPosition = "single" | "first" | "middle" | "last";

function rowSide(row: ChatRow): RowSide {
	switch (row.kind) {
		case "outbox":
			return "user";
		case "turn_status":
			return "system";
		case "working":
		case "tool_run":
		case "activity":
			return "agent";
		case "item":
			if (row.item.kind === "user_message") return "user";
			if (row.item.kind === "notice") return "system";
			return "agent";
	}
}

export function groupPositions(rows: readonly ChatRow[]): GroupPosition[] {
	const sides = rows.map(rowSide);
	return sides.map((side, index) => {
		const joinsPrevious = side !== "system" && sides[index - 1] === side;
		const joinsNext = side !== "system" && sides[index + 1] === side;
		if (joinsPrevious && joinsNext) return "middle";
		if (joinsPrevious) return "last";
		if (joinsNext) return "first";
		return "single";
	});
}

/** The last agent reply before each of the user's turns, past any activity after it. */
export function lastReplyKeys(rows: readonly ChatRow[]): Set<string> {
	const keys = new Set<string>();
	let lastReply: string | null = null;
	for (const row of rows) {
		if (rowSide(row) !== "agent") {
			if (lastReply) keys.add(lastReply);
			lastReply = null;
			continue;
		}
		if (row.kind === "item" && row.item.kind === "agent_message")
			lastReply = row.key;
	}
	if (lastReply) keys.add(lastReply);
	return keys;
}
