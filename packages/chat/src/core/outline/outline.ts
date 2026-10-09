import type { Cursor } from "../../protocol/cursor";
import type { SessionState, Turn } from "../../protocol/envelope";
import type { Item, ToolCall } from "../../protocol/items";
import {
	emptySnapshot,
	type SessionSnapshot,
	type StoredItem,
} from "../reducer/reducer";

export const OUTLINE_TITLE_CHARS = 200;

export type SessionOutline = {
	session: SessionState | null;
	turns: Turn[];
	items: StoredItem[];
	cursor: Cursor | null;
};

function outlineToolCall(item: ToolCall): ToolCall {
	const { rawInput: _rawInput, rawOutput: _rawOutput, ...rest } = item;
	return {
		...rest,
		title:
			item.title.length > OUTLINE_TITLE_CHARS
				? `${item.title.slice(0, OUTLINE_TITLE_CHARS)}…`
				: item.title,
		content: [],
		bodyOmitted: true,
	};
}

export function hasOmittedBody(item: Item): boolean {
	return item.kind === "tool_call" && item.bodyOmitted === true;
}

export function outlineSnapshot(snapshot: SessionSnapshot): SessionOutline {
	return {
		session: snapshot.session,
		turns: [...snapshot.turns.values()],
		items: [...snapshot.items.values()].map((stored) =>
			stored.item.kind === "tool_call"
				? { ...stored, item: outlineToolCall(stored.item as ToolCall) }
				: stored,
		),
		cursor: snapshot.cursor,
	};
}

export function snapshotFromOutline(outline: SessionOutline): SessionSnapshot {
	return {
		...emptySnapshot(),
		session: outline.session,
		turns: new Map(outline.turns.map((turn) => [turn.id, turn])),
		items: new Map(outline.items.map((stored) => [stored.item.id, stored])),
		cursor: outline.cursor,
	};
}

export function withItemBodies(
	snapshot: SessionSnapshot,
	bodies: readonly StoredItem[],
): SessionSnapshot {
	let items: Map<string, StoredItem> | null = null;
	for (const body of bodies) {
		const current = snapshot.items.get(body.item.id);
		if (!current || !hasOmittedBody(current.item)) continue;
		items ??= new Map(snapshot.items);
		items.set(body.item.id, body);
	}
	return items ? { ...snapshot, items } : snapshot;
}
