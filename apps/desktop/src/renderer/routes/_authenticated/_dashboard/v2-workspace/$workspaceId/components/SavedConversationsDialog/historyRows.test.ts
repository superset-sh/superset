import { expect, test } from "bun:test";
import { historyRows, type SavedHistoryPage } from "./historyRows";

test("two native IDs remain separate even when the discovery page is shared", () => {
	const rows = historyRows([
		{
			candidates: ["first-native", "second-native"].map((nativeSessionId) => ({
				nativeSessionId,
				revision: `revision-${nativeSessionId}`,
				bytes: 42,
				lastModifiedAt: 1,
				conversationId: null,
			})),
			conversations: [],
			nextCursor: null,
		},
	]);
	expect(rows.map((row) => row.nativeSessionId)).toEqual([
		"first-native",
		"second-native",
	]);
});

test("newer persisted lineage supersedes stale discovery metadata without duplicating rows", () => {
	const first: SavedHistoryPage = {
		candidates: [
			{
				nativeSessionId: "native",
				revision: "scan-old",
				bytes: 42,
				lastModifiedAt: 1,
				conversationId: null,
			},
		],
		conversations: [],
		nextCursor: "cursor",
	};
	const next: SavedHistoryPage = {
		candidates: [],
		conversations: [
			{
				id: "local",
				nativeSessionId: "native",
				revision: "bound-new",
				state: "bound",
				terminalId: "terminal",
				canFocusExisting: true,
			},
		],
		nextCursor: null,
	};
	expect(historyRows([first, next])).toEqual([
		{
			id: "native",
			nativeSessionId: "native",
			lastModifiedAt: 1,
			conversationId: "local",
			revision: "bound-new",
			canFocusExisting: true,
		},
	]);
});

test("saved records remain visible when the original discovery no longer finds a file", () => {
	const rows = historyRows([
		{
			candidates: [],
			conversations: [
				{
					id: "local",
					nativeSessionId: "native",
					revision: "saved",
					state: "adopted",
					terminalId: null,
					canFocusExisting: false,
				},
			],
			nextCursor: null,
		},
	]);
	expect(rows).toHaveLength(1);
	expect(rows[0]?.conversationId).toBe("local");
	expect(rows[0]?.revision).toBe("saved");
});
