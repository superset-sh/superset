import type { Tab } from "renderer/stores/tabs/types";

/**
 * Returns all tabs belonging to the given workspace.
 *
 * TabsContent renders every tab returned here simultaneously — inactive tabs
 * are hidden with `display: none` rather than unmounted. This keeps BrowserPane
 * alive across tab switches so the Electron <webview> is never reparented in the
 * DOM, which would otherwise trigger a full page reload.
 */
export function getWorkspaceTabsToRender(
	tabs: Tab[],
	workspaceId: string | null | undefined,
): Tab[] {
	if (!workspaceId) return [];
	return tabs.filter((t) => t.workspaceId === workspaceId);
}
