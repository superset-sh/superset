import { describe, expect, it } from "bun:test";
import { resolveNotificationTarget } from "./resolve-notification-target";

describe("resolveNotificationTarget", () => {
	const createPane = (id: string, tabId: string) => ({
		id,
		tabId,
		type: "terminal" as const,
		name: "Terminal",
	});

	const createTab = (id: string, workspaceId: string) => ({
		id,
		name: "Tab",
		workspaceId,
		createdAt: Date.now(),
		layout: id,
	});

	describe("with all IDs provided", () => {
		it("returns the provided IDs", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "pane-1", tabId: "tab-1", workspaceId: "ws-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with missing workspaceId", () => {
		it("resolves workspaceId from tab", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "pane-1", tabId: "tab-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with missing tabId", () => {
		it("resolves tabId from pane", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget(
				{ paneId: "pane-1", workspaceId: "ws-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with missing tabId and workspaceId", () => {
		it("resolves both from pane and tab chain", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget({ paneId: "pane-1" }, state);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with only tabId", () => {
		it("resolves workspaceId from tab", () => {
			const state = {
				panes: {},
				tabs: [createTab("tab-1", "ws-1")],
			};

			const result = resolveNotificationTarget({ tabId: "tab-1" }, state);

			expect(result).toEqual({
				paneId: undefined,
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});

		it("resolves paneId from focusedPaneIds when available", () => {
			// Reproduces the bug from issue #1838:
			// When the server's resolvePaneId fails due to stale appState
			// (tabsState not yet synced from renderer), the event arrives with
			// paneId: undefined but tabId still set. The renderer should recover
			// paneId from its in-memory focusedPaneIds so the status update proceeds.
			// Without this fix, useAgentHookListener's `if (!paneId) return` skips
			// the update and visual indicators + notifications never appear.
			const state = {
				panes: { "pane-1": createPane("pane-1", "tab-1") },
				tabs: [createTab("tab-1", "ws-1")],
				focusedPaneIds: { "tab-1": "pane-1" },
			};

			const result = resolveNotificationTarget(
				{ tabId: "tab-1", workspaceId: "ws-1" },
				state,
			);

			expect(result).toEqual({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
			});
		});
	});

	describe("with only workspaceId", () => {
		it("returns workspaceId with undefined pane and tab", () => {
			const state = {
				panes: {},
				tabs: [],
			};

			const result = resolveNotificationTarget({ workspaceId: "ws-1" }, state);

			expect(result).toEqual({
				paneId: undefined,
				tabId: undefined,
				workspaceId: "ws-1",
			});
		});
	});

	describe("with no resolvable workspaceId", () => {
		it("returns null when no IDs provided", () => {
			const state = { panes: {}, tabs: [] };

			const result = resolveNotificationTarget({}, state);

			expect(result).toBeNull();
		});

		it("returns null when pane not found", () => {
			const state = { panes: {}, tabs: [] };

			const result = resolveNotificationTarget({ paneId: "missing" }, state);

			expect(result).toBeNull();
		});

		it("returns null when tab not found", () => {
			const state = { panes: {}, tabs: [] };

			const result = resolveNotificationTarget({ tabId: "missing" }, state);

			expect(result).toBeNull();
		});
	});

	describe("with pane pointing to missing tab", () => {
		it("returns null when tab not in state", () => {
			const state = {
				panes: { "pane-1": createPane("pane-1", "missing-tab") },
				tabs: [],
			};

			const result = resolveNotificationTarget({ paneId: "pane-1" }, state);

			expect(result).toBeNull();
		});
	});
});
