import type { Tab } from "renderer/stores/tabs/types";

/**
 * Returns the tabs that should be rendered (and kept mounted) for a workspace.
 *
 * All workspace tabs are returned so their BrowserPanes stay mounted at all
 * times. CSS (display:none) controls visibility; the <webview> elements are
 * never reparented between DOM nodes, which would otherwise trigger a full
 * page reload in Electron (issue #1935).
 */
export function getWorkspaceTabsToRender(
	tabs: Tab[],
	workspaceId: string,
): Tab[] {
	return tabs.filter((tab) => tab.workspaceId === workspaceId);
}
