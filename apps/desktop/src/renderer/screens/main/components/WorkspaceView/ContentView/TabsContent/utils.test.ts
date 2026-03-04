import { describe, expect, it } from "bun:test";
import type { Tab } from "renderer/stores/tabs/types";
import { getWorkspaceTabsToRender } from "./utils";

// Minimal Tab fixture
const createTab = ({
	id,
	workspaceId,
}: {
	id: string;
	workspaceId: string;
}): Tab => ({
	id,
	name: id,
	workspaceId,
	layout: `${id}-pane`,
	createdAt: 0,
});

describe("getWorkspaceTabsToRender", () => {
	/**
	 * Reproduces #1834: Browser Preview reloads on every tab switch.
	 *
	 * Root cause: TabsContent previously only rendered the *active* tab. When
	 * the user switched away, BrowserPane unmounted, which moved the Electron
	 * <webview> to an off-screen hidden container. Moving it back on switch-
	 * return caused Electron to reload the page (DOM reparenting = full reload).
	 *
	 * Fix: All workspace tabs must be rendered simultaneously. Inactive tabs
	 * are hidden via CSS (`display: none`) so BrowserPane — and its webview —
	 * is never unmounted during a tab switch.
	 */
	it("returns ALL workspace tabs, not only the active one", () => {
		const tabs = [
			createTab({ id: "tab-terminal", workspaceId: "ws-1" }), // active tab
			createTab({ id: "tab-browser", workspaceId: "ws-1" }), // inactive browser tab
			createTab({ id: "tab-other-ws", workspaceId: "ws-2" }),
		];

		const result = getWorkspaceTabsToRender(tabs, "ws-1");

		// Both ws-1 tabs must be returned so they are kept mounted.
		// If only the active tab were returned, switching away from the browser
		// tab would unmount BrowserPane and reload the webview.
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id)).toContain("tab-terminal");
		expect(result.map((t) => t.id)).toContain("tab-browser");
		expect(result.map((t) => t.id)).not.toContain("tab-other-ws");
	});

	it("returns empty array when workspaceId is null", () => {
		const tabs = [createTab({ id: "tab-a", workspaceId: "ws-1" })];
		expect(getWorkspaceTabsToRender(tabs, null)).toEqual([]);
	});

	it("returns empty array when workspaceId is undefined", () => {
		const tabs = [createTab({ id: "tab-a", workspaceId: "ws-1" })];
		expect(getWorkspaceTabsToRender(tabs, undefined)).toEqual([]);
	});

	it("returns empty array when no tabs match the workspace", () => {
		const tabs = [createTab({ id: "tab-a", workspaceId: "ws-1" })];
		expect(getWorkspaceTabsToRender(tabs, "ws-99")).toEqual([]);
	});

	it("returns empty array when tabs list is empty", () => {
		expect(getWorkspaceTabsToRender([], "ws-1")).toEqual([]);
	});

	it("does not include tabs from other workspaces", () => {
		const tabs = [
			createTab({ id: "tab-a", workspaceId: "ws-1" }),
			createTab({ id: "tab-b", workspaceId: "ws-2" }),
			createTab({ id: "tab-c", workspaceId: "ws-2" }),
		];

		const result = getWorkspaceTabsToRender(tabs, "ws-2");
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id)).not.toContain("tab-a");
	});
});
