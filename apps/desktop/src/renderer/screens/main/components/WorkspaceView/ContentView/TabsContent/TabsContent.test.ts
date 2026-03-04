/**
 * Regression test for issue #1935 — browser panes refresh on tab switch.
 *
 * Root cause: TabsContent previously only rendered the *active* tab. When
 * switching tabs, the inactive TabView unmounted → BrowserPane unmounted →
 * usePersistentWebview cleanup moved the <webview> element to an off-screen
 * container (DOM reparenting). In Electron, reparenting a <webview> element
 * between DOM nodes triggers a full page reload, losing all browser state.
 *
 * Fix: render ALL workspace tabs simultaneously; CSS (display: none) controls
 * visibility. BrowserPane stays mounted for inactive tabs, so the <webview>
 * element is never reparented and never reloads.
 */
import { describe, expect, test } from "bun:test";
import type { Tab } from "renderer/stores/tabs/types";
import { getWorkspaceTabsToRender } from "./utils";

const makeTab = (id: string, workspaceId: string): Tab => ({
	id,
	workspaceId,
	name: id,
	createdAt: 0,
	layout: id,
});

describe("getWorkspaceTabsToRender", () => {
	test("returns ALL workspace tabs, not just the active one", () => {
		const tabs = [makeTab("tab-a", "ws-1"), makeTab("tab-b", "ws-1")];

		const result = getWorkspaceTabsToRender(tabs, "ws-1");

		// Both tabs must be included so their BrowserPanes stay mounted.
		// If only tab-a (the active tab) were returned, tab-b's BrowserPane
		// would unmount on switch → webview reparented → Electron reloads the page.
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id)).toContain("tab-b");
	});

	test("excludes tabs belonging to other workspaces", () => {
		const tabs = [makeTab("tab-a", "ws-1"), makeTab("tab-b", "ws-2")];

		const result = getWorkspaceTabsToRender(tabs, "ws-1");

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("tab-a");
	});

	test("returns empty array when workspace has no tabs", () => {
		const tabs = [makeTab("tab-a", "ws-2")];

		const result = getWorkspaceTabsToRender(tabs, "ws-1");

		expect(result).toHaveLength(0);
	});
});
