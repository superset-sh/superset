import { afterEach, expect, test } from "bun:test";
import type { OutboxEntry } from "@superset/chat/core";
import type { TranscriptRow } from "../../utils/transcriptRows";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook } = await import("@testing-library/react");
const { useScrollAnchorKey } = await import("./useScrollAnchorKey");

afterEach(cleanup);
function userRow(key: string): TranscriptRow {
	return {
		kind: "item",
		key,
		groupStart: true,
		item: {
			id: `item-${key}`,
			kind: "user_message",
			clientId: key,
			startedAtMs: 1,
			content: [],
		},
	};
}

function outboxEntry(clientId: string): OutboxEntry {
	return { clientId, content: [], state: "sending" } as unknown as OutboxEntry;
}

function outboxRow(clientId: string): TranscriptRow {
	return {
		kind: "outbox",
		key: clientId,
		groupStart: true,
		entry: outboxEntry(clientId),
	};
}

test("anchors the latest message sent here, not one from another client", () => {
	const idle = { turnRunning: false, readerScrolledAway: { current: false } };
	const { result, rerender } = renderHook(
		({ rows, outbox }) => useScrollAnchorKey(rows, outbox, idle),
		{ initialProps: { rows: [userRow("old")], outbox: [] as OutboxEntry[] } },
	);
	expect(result.current).toBeNull();

	rerender({
		rows: [userRow("old"), outboxRow("mine")],
		outbox: [outboxEntry("mine")],
	});
	expect(result.current).toBe("mine");

	rerender({
		rows: [userRow("old"), userRow("mine"), userRow("theirs")],
		outbox: [],
	});
	expect(result.current).toBe("mine");
});

test("a prompt sent mid-turn is anchored when it starts, not while it waits", () => {
	const readerScrolledAway = { current: false };
	const { result, rerender } = renderHook(
		({ rows, outbox, turnRunning }) =>
			useScrollAnchorKey(rows, outbox, { turnRunning, readerScrolledAway }),
		{
			initialProps: {
				rows: [userRow("old")],
				outbox: [] as OutboxEntry[],
				turnRunning: false,
			},
		},
	);
	rerender({
		rows: [userRow("old"), outboxRow("first")],
		outbox: [outboxEntry("first")],
		turnRunning: false,
	});
	expect(result.current).toBe("first");

	rerender({
		rows: [userRow("old"), userRow("first"), outboxRow("queued")],
		outbox: [outboxEntry("queued")],
		turnRunning: true,
	});
	expect(result.current).toBe("first");

	rerender({
		rows: [userRow("old"), userRow("first"), userRow("queued")],
		outbox: [],
		turnRunning: true,
	});
	expect(result.current).toBe("queued");
});

test("a queued prompt that starts does not move a reader who scrolled away", () => {
	const readerScrolledAway = { current: false };
	const { result, rerender } = renderHook(
		({ rows, outbox }) =>
			useScrollAnchorKey(rows, outbox, {
				turnRunning: true,
				readerScrolledAway,
			}),
		{
			initialProps: {
				rows: [userRow("first")],
				outbox: [] as OutboxEntry[],
			},
		},
	);
	rerender({
		rows: [userRow("first"), outboxRow("queued")],
		outbox: [outboxEntry("queued")],
	});
	readerScrolledAway.current = true;
	rerender({ rows: [userRow("first"), userRow("queued")], outbox: [] });
	expect(result.current).toBeNull();
});
