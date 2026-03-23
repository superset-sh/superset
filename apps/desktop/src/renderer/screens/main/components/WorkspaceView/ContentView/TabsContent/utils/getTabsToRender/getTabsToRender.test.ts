import { describe, expect, it } from "bun:test";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { getTabsToRender } from "./getTabsToRender";

function createTab(id: string, workspaceId: string, paneId: string): Tab {
	return {
		id,
		name: id,
		workspaceId,
		layout: paneId,
		createdAt: 1,
	};
}

function createPane(id: string, tabId: string, type: Pane["type"]): Pane {
	return {
		id,
		tabId,
		type,
		name: id,
	};
}

describe("getTabsToRender", () => {
	it("keeps the active tab first and adds inactive browser tabs", () => {
		const tabs = [
			createTab("tab-terminal", "ws-1", "pane-terminal"),
			createTab("tab-browser", "ws-1", "pane-browser"),
			createTab("tab-chat", "ws-1", "pane-chat"),
		];
		const panes: Record<string, Pane> = {
			"pane-terminal": createPane("pane-terminal", "tab-terminal", "terminal"),
			"pane-browser": createPane("pane-browser", "tab-browser", "webview"),
			"pane-chat": createPane("pane-chat", "tab-chat", "chat"),
		};

		expect(
			getTabsToRender({
				activeTabId: "tab-terminal",
				tabs,
				panes,
			}).map((tab) => tab.id),
		).toEqual(["tab-terminal", "tab-browser"]);
	});

	it("does not duplicate the active browser tab", () => {
		const tabs = [createTab("tab-browser", "ws-1", "pane-browser")];
		const panes: Record<string, Pane> = {
			"pane-browser": createPane("pane-browser", "tab-browser", "webview"),
		};

		expect(
			getTabsToRender({
				activeTabId: "tab-browser",
				tabs,
				panes,
			}).map((tab) => tab.id),
		).toEqual(["tab-browser"]);
	});

	it("keeps browser tabs mounted across workspaces", () => {
		const tabs = [
			createTab("tab-terminal", "ws-1", "pane-terminal"),
			createTab("tab-browser", "ws-2", "pane-browser"),
		];
		const panes: Record<string, Pane> = {
			"pane-terminal": createPane("pane-terminal", "tab-terminal", "terminal"),
			"pane-browser": createPane("pane-browser", "tab-browser", "webview"),
		};

		expect(
			getTabsToRender({
				activeTabId: "tab-terminal",
				tabs,
				panes,
			}).map((tab) => tab.id),
		).toEqual(["tab-terminal", "tab-browser"]);
	});

	it("ignores a stale active tab id and still keeps browser tabs mounted", () => {
		const tabs = [
			createTab("tab-terminal", "ws-1", "pane-terminal"),
			createTab("tab-browser", "ws-1", "pane-browser"),
		];
		const panes: Record<string, Pane> = {
			"pane-terminal": createPane("pane-terminal", "tab-terminal", "terminal"),
			"pane-browser": createPane("pane-browser", "tab-browser", "webview"),
		};

		expect(
			getTabsToRender({
				activeTabId: "tab-missing",
				tabs,
				panes,
			}).map((tab) => tab.id),
		).toEqual(["tab-browser"]);
	});

	it("skips inactive tabs without a browser pane", () => {
		const tabs = [
			createTab("tab-terminal", "ws-1", "pane-terminal"),
			createTab("tab-chat", "ws-2", "pane-chat"),
		];
		const panes: Record<string, Pane> = {
			"pane-terminal": createPane("pane-terminal", "tab-terminal", "terminal"),
			"pane-chat": createPane("pane-chat", "tab-chat", "chat"),
		};

		expect(
			getTabsToRender({
				activeTabId: null,
				tabs,
				panes,
			}),
		).toEqual([]);
	});
});
