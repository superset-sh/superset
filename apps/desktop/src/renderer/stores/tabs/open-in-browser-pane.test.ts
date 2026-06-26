import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock Electron-dependent modules before importing the store
// biome-ignore lint/suspicious/noExplicitAny: recursive proxy for mocking
const noopProxy: any = new Proxy(
	{},
	{
		get: () => noopProxy,
		apply: () => noopProxy,
	},
);

mock.module("renderer/lib/trpc-client", () => ({
	electronReactClient: noopProxy,
	electronTrpcClient: noopProxy,
}));

mock.module("renderer/lib/trpc-storage", () => ({
	trpcTabsStorage: {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
	},
}));

mock.module("renderer/lib/posthog", () => ({
	posthog: { capture: () => {} },
	initPostHog: () => {},
}));

const { useTabsStore } = await import("./store");

/**
 * Regression test for https://github.com/supersetapp/superset/issues/3247
 *
 * Bug: clicking a target="_blank" link in a browser pane calls
 * `openInBrowserPane`, which finds ANY existing browser pane in the workspace
 * and updates its store state — potentially on a different tab — instead of
 * opening a new tab. The webview itself is never told to navigate (no loadURL
 * call), so the URL bar changes but the page does not.
 *
 * Fix: the onNewWindow handler should call `addBrowserTab` so that
 * target="_blank" links open in a brand-new tab (matching browser behaviour).
 */

function resetStore() {
	useTabsStore.setState({
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
		closedTabsStack: [],
	});
}

describe("openInBrowserPane — issue #3247", () => {
	beforeEach(resetStore);

	it("reuses an existing browser pane instead of creating a new tab", () => {
		const store = useTabsStore.getState();
		const workspaceId = "ws-1";

		// Create an initial browser tab at google.com
		const { paneId: pane1Id } = store.addBrowserTab(
			workspaceId,
			"https://google.com",
		);

		const stateBefore = useTabsStore.getState();
		expect(stateBefore.tabs).toHaveLength(1);
		expect(stateBefore.panes[pane1Id]?.browser?.currentUrl).toBe(
			"https://google.com",
		);

		// Simulate what happens when a target="_blank" link is clicked:
		// the onNewWindow handler currently calls openInBrowserPane.
		useTabsStore
			.getState()
			.openInBrowserPane(workspaceId, "https://example.com");

		const stateAfter = useTabsStore.getState();

		// BUG: openInBrowserPane reuses the existing pane — no new tab is created.
		// The store URL updates, but nothing calls loadURL() on the webview.
		expect(stateAfter.tabs).toHaveLength(1); // still 1 tab — this is the bug
		expect(stateAfter.panes[pane1Id]?.browser?.currentUrl).toBe(
			"https://example.com",
		);
	});

	it("navigates a pane on a different tab when multiple browser tabs exist", () => {
		const store = useTabsStore.getState();
		const workspaceId = "ws-1";

		// Create two browser tabs
		const { paneId: pane1Id } = store.addBrowserTab(
			workspaceId,
			"https://google.com",
		);
		const { tabId: tab2Id, paneId: pane2Id } = useTabsStore
			.getState()
			.addBrowserTab(workspaceId, "https://github.com");

		// tab2 is now active (addBrowserTab makes the new tab active)
		const stateBeforeNav = useTabsStore.getState();
		expect(stateBeforeNav.activeTabIds[workspaceId]).toBe(tab2Id);

		// openInBrowserPane finds the FIRST browser pane (pane1 on tab1), not the
		// current one. This switches the user to a different tab.
		useTabsStore
			.getState()
			.openInBrowserPane(workspaceId, "https://example.com");

		const stateAfterNav = useTabsStore.getState();

		// BUG: pane1 (on tab1) was navigated, not pane2 (on the active tab2).
		// The user gets yanked to tab1.
		expect(stateAfterNav.panes[pane1Id]?.browser?.currentUrl).toBe(
			"https://example.com",
		);
		// pane2 on the active tab is untouched
		expect(stateAfterNav.panes[pane2Id]?.browser?.currentUrl).toBe(
			"https://github.com",
		);
	});
});

describe("addBrowserTab — correct behaviour for target='_blank' links", () => {
	beforeEach(resetStore);

	it("creates a new tab for the URL instead of reusing an existing pane", () => {
		const store = useTabsStore.getState();
		const workspaceId = "ws-1";

		// Start with one browser tab
		const { paneId: pane1Id } = store.addBrowserTab(
			workspaceId,
			"https://google.com",
		);

		// The fix: use addBrowserTab for target="_blank" links
		const { tabId: newTabId, paneId: newPaneId } = useTabsStore
			.getState()
			.addBrowserTab(workspaceId, "https://example.com");

		const state = useTabsStore.getState();

		// A new tab was created
		expect(state.tabs).toHaveLength(2);

		// The original pane is untouched
		expect(state.panes[pane1Id]?.browser?.currentUrl).toBe(
			"https://google.com",
		);

		// The new pane has the correct URL
		expect(state.panes[newPaneId]?.browser?.currentUrl).toBe(
			"https://example.com",
		);

		// The new tab is now active
		expect(state.activeTabIds[workspaceId]).toBe(newTabId);
	});
});
