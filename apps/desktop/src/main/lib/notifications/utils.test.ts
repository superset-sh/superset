import { describe, expect, it } from "bun:test";
import {
	extractWorkspaceIdFromUrl,
	getNotificationTitle,
	getWorkspaceName,
	isPaneVisible,
} from "./utils";

describe("extractWorkspaceIdFromUrl", () => {
	it("extracts workspace ID from hash-routed URL", () => {
		const url = "file:///app/index.html#/workspace/abc123";
		expect(extractWorkspaceIdFromUrl(url)).toBe("abc123");
	});

	it("extracts workspace ID when file path contains /workspace/", () => {
		// This is the key case - file path has /workspace/ but we should extract from hash
		const url =
			"file:///Users/foo/workspace/superset/dist/index.html#/workspace/def456";
		expect(extractWorkspaceIdFromUrl(url)).toBe("def456");
	});

	it("handles query params in hash", () => {
		const url = "file:///app/index.html#/workspace/ghi789?foo=bar";
		expect(extractWorkspaceIdFromUrl(url)).toBe("ghi789");
	});

	it("handles nested hash fragments", () => {
		const url = "file:///app/index.html#/workspace/jkl012#section";
		expect(extractWorkspaceIdFromUrl(url)).toBe("jkl012");
	});

	it("handles UUIDs as workspace IDs", () => {
		const url =
			"file:///app/index.html#/workspace/550e8400-e29b-41d4-a716-446655440000";
		expect(extractWorkspaceIdFromUrl(url)).toBe(
			"550e8400-e29b-41d4-a716-446655440000",
		);
	});

	it("returns null when no workspace in hash", () => {
		const url = "file:///app/index.html#/settings/account";
		expect(extractWorkspaceIdFromUrl(url)).toBeNull();
	});

	it("returns null when URL has no hash", () => {
		const url = "file:///app/index.html";
		expect(extractWorkspaceIdFromUrl(url)).toBeNull();
	});

	it("returns null for invalid URL", () => {
		expect(extractWorkspaceIdFromUrl("not-a-valid-url")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractWorkspaceIdFromUrl("")).toBeNull();
	});

	it("handles http URLs with hash routing", () => {
		const url = "http://localhost:5173/#/workspace/mno345";
		expect(extractWorkspaceIdFromUrl(url)).toBe("mno345");
	});
});

describe("isPaneVisible", () => {
	const pane = { workspaceId: "ws1", tabId: "tab1", paneId: "pane1" };

	it("returns true when pane is fully visible", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws1",
				tabsState: {
					activeTabIds: { ws1: "tab1" },
					focusedPaneIds: { tab1: "pane1" },
				},
				pane,
			}),
		).toBe(true);
	});

	it("returns false when viewing different workspace", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws2",
				tabsState: {
					activeTabIds: { ws1: "tab1" },
					focusedPaneIds: { tab1: "pane1" },
				},
				pane,
			}),
		).toBe(false);
	});

	it("returns false when different tab is active", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws1",
				tabsState: {
					activeTabIds: { ws1: "tab2" },
					focusedPaneIds: { tab1: "pane1" },
				},
				pane,
			}),
		).toBe(false);
	});

	it("returns false when different pane is focused", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws1",
				tabsState: {
					activeTabIds: { ws1: "tab1" },
					focusedPaneIds: { tab1: "pane2" },
				},
				pane,
			}),
		).toBe(false);
	});

	it("returns false when currentWorkspaceId is null", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: null,
				tabsState: {
					activeTabIds: { ws1: "tab1" },
					focusedPaneIds: { tab1: "pane1" },
				},
				pane,
			}),
		).toBe(false);
	});

	it("returns false when tabsState is undefined", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws1",
				tabsState: undefined,
				pane,
			}),
		).toBe(false);
	});

	it("returns false when activeTabIds is missing", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws1",
				tabsState: { focusedPaneIds: { tab1: "pane1" } },
				pane,
			}),
		).toBe(false);
	});

	it("returns false when focusedPaneIds is missing", () => {
		expect(
			isPaneVisible({
				currentWorkspaceId: "ws1",
				tabsState: { activeTabIds: { ws1: "tab1" } },
				pane,
			}),
		).toBe(false);
	});
});

describe("getNotificationTitle", () => {
	const tabs = [
		{ id: "tab1", name: "Tab 1", userTitle: "My Custom Title" },
		{ id: "tab2", name: "Tab 2" },
	];
	const panes = {
		pane1: { name: "Pane 1" },
		pane2: { name: "Pane 2" },
	};

	it("returns userTitle when available", () => {
		expect(getNotificationTitle({ tabId: "tab1", tabs, panes })).toBe(
			"My Custom Title",
		);
	});

	it("returns tab.name when no userTitle", () => {
		expect(getNotificationTitle({ tabId: "tab2", tabs, panes })).toBe("Tab 2");
	});

	it("returns pane.name when no tab found", () => {
		expect(getNotificationTitle({ paneId: "pane1", tabs, panes })).toBe(
			"Pane 1",
		);
	});

	it("returns Terminal as fallback", () => {
		expect(getNotificationTitle({})).toBe("Terminal");
	});

	it("trims whitespace from userTitle", () => {
		const tabsWithWhitespace = [{ id: "t1", name: "Tab", userTitle: "  " }];
		expect(
			getNotificationTitle({ tabId: "t1", tabs: tabsWithWhitespace }),
		).toBe("Tab");
	});
});

describe("getWorkspaceName", () => {
	it("returns workspace.name when available", () => {
		expect(
			getWorkspaceName({
				workspace: { name: "My Workspace", worktreeId: null },
			}),
		).toBe("My Workspace");
	});

	it("returns worktree.branch when no workspace name", () => {
		expect(
			getWorkspaceName({
				workspace: { name: null, worktreeId: "wt1" },
				worktree: { branch: "feature/test" },
			}),
		).toBe("feature/test");
	});

	it("returns Workspace as fallback", () => {
		expect(getWorkspaceName({})).toBe("Workspace");
	});

	it("returns Workspace when all values are null", () => {
		expect(
			getWorkspaceName({
				workspace: { name: null, worktreeId: null },
				worktree: { branch: null },
			}),
		).toBe("Workspace");
	});
});
