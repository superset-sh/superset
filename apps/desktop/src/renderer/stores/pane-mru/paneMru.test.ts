import { describe, expect, it } from "bun:test";
import { MAX_MRU_ENTRIES, pruneToOpenPanes, recordFocus } from "./paneMru";
import { entryKey, type PaneMruEntry } from "./types";

function makeEntry(overrides: Partial<PaneMruEntry> = {}): PaneMruEntry {
	return {
		workspaceId: "ws-1",
		tabId: "tab-1",
		paneId: "pane-1",
		kind: "chat",
		label: "Chat",
		tabLabel: "Tab 1",
		workspaceName: "Workspace 1",
		lastFocusedAt: 1,
		...overrides,
	};
}

describe("entryKey", () => {
	it("distinguishes identical pane ids in different workspaces", () => {
		const a = makeEntry({ workspaceId: "ws-1", paneId: "pane-x" });
		const b = makeEntry({ workspaceId: "ws-2", paneId: "pane-x" });
		expect(entryKey(a)).not.toBe(entryKey(b));
	});

	it("distinguishes different panes in the same workspace", () => {
		const a = makeEntry({ workspaceId: "ws-1", paneId: "pane-a" });
		const b = makeEntry({ workspaceId: "ws-1", paneId: "pane-b" });
		expect(entryKey(a)).not.toBe(entryKey(b));
	});
});

describe("recordFocus", () => {
	it("puts a new pane at the front", () => {
		const existing = makeEntry({ paneId: "pane-1" });
		const incoming = makeEntry({ paneId: "pane-2", label: "Terminal" });

		const result = recordFocus({ entries: [existing], entry: incoming });

		expect(result.map((e) => e.paneId)).toEqual(["pane-2", "pane-1"]);
	});

	it("moves an existing pane to the front without duplicating it", () => {
		const entries = [
			makeEntry({ paneId: "pane-3" }),
			makeEntry({ paneId: "pane-2" }),
			makeEntry({ paneId: "pane-1" }),
		];

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-1", lastFocusedAt: 99 }),
		});

		expect(result.map((e) => e.paneId)).toEqual(["pane-1", "pane-3", "pane-2"]);
		expect(result).toHaveLength(3);
	});

	it("returns the same array reference when re-focusing the current pane", () => {
		const entries = [makeEntry({ paneId: "pane-1" })];

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-1", lastFocusedAt: 500 }),
		});

		expect(result).toBe(entries);
	});

	it("updates the head when its agent was detected after first record", () => {
		// A terminal is often recorded before the host-service tracker binds an
		// agent to it. Without this the row would keep a generic glyph forever.
		const entries = [makeEntry({ paneId: "pane-1", agentId: undefined })];

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-1", agentId: "claude" }),
		});

		expect(result).not.toBe(entries);
		expect(result[0].agentId).toBe("claude");
	});

	it("still updates the head when its label changed", () => {
		const entries = [makeEntry({ paneId: "pane-1", label: "Chat" })];

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-1", label: "Fix the parser" }),
		});

		expect(result).not.toBe(entries);
		expect(result[0].label).toBe("Fix the parser");
		expect(result).toHaveLength(1);
	});

	it("treats the same pane id in another workspace as a distinct entry", () => {
		const entries = [makeEntry({ workspaceId: "ws-1", paneId: "pane-1" })];

		const result = recordFocus({
			entries,
			entry: makeEntry({ workspaceId: "ws-2", paneId: "pane-1" }),
		});

		expect(result.map((e) => [e.workspaceId, e.paneId])).toEqual([
			["ws-2", "pane-1"],
			["ws-1", "pane-1"],
		]);
	});

	it("re-records when the pane moved to a different tab", () => {
		// tabId is what the switcher files into the focus intent, so a stale
		// one silently routes the switch to the wrong tab.
		const entries = [makeEntry({ paneId: "pane-1", tabId: "tab-1" })];

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-1", tabId: "tab-2" }),
		});

		expect(result).not.toBe(entries);
		expect(result[0].tabId).toBe("tab-2");
	});

	it("does not mutate the array it was given", () => {
		// advanceCycle keeps a live store array as its frozen snapshot, which is
		// only safe because these helpers are copy-on-write.
		const entries = [makeEntry({ paneId: "pane-1" })];
		const before = [...entries];

		recordFocus({ entries, entry: makeEntry({ paneId: "pane-2" }) });

		expect(entries).toEqual(before);
	});

	it("trims a persisted list that is already longer than the cap", () => {
		const entries = Array.from({ length: MAX_MRU_ENTRIES + 25 }, (_, index) =>
			makeEntry({ paneId: `pane-${index}` }),
		);

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-new" }),
		});

		expect(result).toHaveLength(MAX_MRU_ENTRIES);
	});

	it("caps the list at MAX_MRU_ENTRIES, dropping the oldest", () => {
		const entries = Array.from({ length: MAX_MRU_ENTRIES }, (_, index) =>
			makeEntry({ paneId: `pane-${index}` }),
		);

		const result = recordFocus({
			entries,
			entry: makeEntry({ paneId: "pane-new" }),
		});

		expect(result).toHaveLength(MAX_MRU_ENTRIES);
		expect(result[0].paneId).toBe("pane-new");
		expect(result.some((e) => e.paneId === `pane-${MAX_MRU_ENTRIES - 1}`)).toBe(
			false,
		);
	});
});

describe("pruneToOpenPanes", () => {
	it("drops a pane that is no longer open in a loaded workspace", () => {
		const entries = [
			makeEntry({ workspaceId: "ws-1", paneId: "pane-open" }),
			makeEntry({ workspaceId: "ws-1", paneId: "pane-closed" }),
		];

		const result = pruneToOpenPanes({
			entries,
			openPaneIdsByWorkspace: new Map([["ws-1", new Set(["pane-open"])]]),
		});

		expect(result.map((e) => e.paneId)).toEqual(["pane-open"]);
	});

	it("keeps entries for workspaces absent from the map", () => {
		// Absence means "not loaded yet", not "has no panes". Pruning these
		// would delete good entries whenever the collection is half-hydrated.
		const entries = [
			makeEntry({ workspaceId: "ws-unloaded", paneId: "pane-1" }),
		];

		const result = pruneToOpenPanes({
			entries,
			openPaneIdsByWorkspace: new Map([["ws-1", new Set(["pane-x"])]]),
		});

		expect(result).toEqual(entries);
	});

	it("drops every entry of a loaded workspace that has no panes left", () => {
		const entries = [makeEntry({ workspaceId: "ws-1", paneId: "pane-1" })];

		const result = pruneToOpenPanes({
			entries,
			openPaneIdsByWorkspace: new Map([["ws-1", new Set()]]),
		});

		expect(result).toEqual([]);
	});

	it("prunes only the loaded workspace when the map is partial", () => {
		const entries = [
			makeEntry({ workspaceId: "ws-loaded", paneId: "gone" }),
			makeEntry({ workspaceId: "ws-loaded", paneId: "open" }),
			makeEntry({ workspaceId: "ws-unloaded", paneId: "kept" }),
		];

		const result = pruneToOpenPanes({
			entries,
			openPaneIdsByWorkspace: new Map([["ws-loaded", new Set(["open"])]]),
		});

		expect(result.map((e) => e.paneId)).toEqual(["open", "kept"]);
	});

	it("preserves recency order through a prune", () => {
		const entries = [
			makeEntry({ paneId: "newest" }),
			makeEntry({ paneId: "gone" }),
			makeEntry({ paneId: "oldest" }),
		];

		const result = pruneToOpenPanes({
			entries,
			openPaneIdsByWorkspace: new Map([
				["ws-1", new Set(["newest", "oldest"])],
			]),
		});

		expect(result.map((e) => e.paneId)).toEqual(["newest", "oldest"]);
	});

	it("returns the same reference when everything is still open", () => {
		const entries = [makeEntry({ workspaceId: "ws-1", paneId: "pane-1" })];

		const result = pruneToOpenPanes({
			entries,
			openPaneIdsByWorkspace: new Map([["ws-1", new Set(["pane-1"])]]),
		});

		expect(result).toBe(entries);
	});
});
