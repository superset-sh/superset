import { describe, expect, it } from "bun:test";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";
import { applyTerminalOscTitle } from "./applyTerminalOscTitle";

// Issue #4250: terminal programs that emit OSC 0/2 ("set window title") had
// no effect on the Superset tab label, because the xterm.onTitleChange
// handler only called setPaneName. The tab bar reads from tab.name (via
// getTabDisplayName), so without an additional setTabAutoTitle call the
// label stayed stale.

interface FakeStore {
	tabs: Tab[];
	panes: Record<string, Pane>;
}

const setPaneName = (store: FakeStore, paneId: string, name: string) => {
	const pane = store.panes[paneId];
	if (!pane || pane.name === name) return;
	store.panes[paneId] = { ...pane, name };
};

// Mirrors the guard in renderer/stores/tabs/store.ts setTabAutoTitle: skip
// when the tab has a userTitle so a manual rename still wins.
const setTabAutoTitle = (store: FakeStore, tabId: string, name: string) => {
	const tab = store.tabs.find((t) => t.id === tabId);
	if (!tab || tab.name === name || tab.userTitle?.trim()) return;
	store.tabs = store.tabs.map((t) => (t.id === tabId ? { ...t, name } : t));
};

const seedStore = (overrides?: { userTitle?: string }): FakeStore => {
	const tabId = "tab-1";
	const paneId = "pane-1";
	const tab: Tab = {
		id: tabId,
		name: "Terminal",
		workspaceId: "ws-1",
		createdAt: 0,
		layout: paneId,
		userTitle: overrides?.userTitle,
	};
	const pane: Pane = {
		id: paneId,
		tabId,
		type: "terminal",
		name: "Terminal",
	};
	return { tabs: [tab], panes: { [paneId]: pane } };
};

describe("applyTerminalOscTitle (#4250)", () => {
	it("propagates the OSC title to the tab label so the tab bar reflects it", () => {
		const store = seedStore();
		applyTerminalOscTitle({
			paneId: "pane-1",
			tabId: "tab-1",
			title: "Hello tab",
			setPaneName: (id, name) => setPaneName(store, id, name),
			setTabAutoTitle: (id, name) => setTabAutoTitle(store, id, name),
		});

		const tab = store.tabs.find((t) => t.id === "tab-1");
		expect(tab).toBeDefined();
		expect(getTabDisplayName(tab as Tab)).toBe("Hello tab");
	});

	it("also updates the pane name so split-view panes show the OSC title", () => {
		const store = seedStore();
		applyTerminalOscTitle({
			paneId: "pane-1",
			tabId: "tab-1",
			title: "build watcher",
			setPaneName: (id, name) => setPaneName(store, id, name),
			setTabAutoTitle: (id, name) => setTabAutoTitle(store, id, name),
		});

		expect(store.panes["pane-1"]?.name).toBe("build watcher");
	});

	it("preserves a user-entered tab title (manual rename wins over OSC)", () => {
		const store = seedStore({ userTitle: "My Custom Tab" });
		applyTerminalOscTitle({
			paneId: "pane-1",
			tabId: "tab-1",
			title: "Hello tab",
			setPaneName: (id, name) => setPaneName(store, id, name),
			setTabAutoTitle: (id, name) => setTabAutoTitle(store, id, name),
		});

		const tab = store.tabs.find((t) => t.id === "tab-1");
		expect(tab?.name).toBe("Terminal");
		expect(getTabDisplayName(tab as Tab)).toBe("My Custom Tab");
	});

	it("regression: setPaneName alone (the pre-fix behaviour) leaves the tab label stale", () => {
		// This documents the bug: without the setTabAutoTitle call, the tab
		// label stays "Terminal" even though pane.name is updated.
		const store = seedStore();
		setPaneName(store, "pane-1", "Hello tab");

		const tab = store.tabs.find((t) => t.id === "tab-1");
		expect(store.panes["pane-1"]?.name).toBe("Hello tab");
		expect(getTabDisplayName(tab as Tab)).toBe("Terminal");
	});
});
