import type { Tab } from "../../../../types";

/**
 * Picks the tab to render given the workspace's `tabs` and `activeTabId`.
 * Falls back to the first tab when `activeTabId` is null or stale (does not
 * reference any tab in `tabs`). Returns null only when there are no tabs.
 *
 * Why: persisted state can be restored with a stale `activeTabId` (e.g., the
 * tab it referenced was closed in a prior session). Without this fallback
 * the workspace would render its empty state even though tabs exist.
 */
export function pickActiveTab<TData>(
	tabs: Tab<TData>[],
	activeTabId: string | null,
): Tab<TData> | null {
	if (tabs.length === 0) return null;
	const matched = activeTabId
		? (tabs.find((t) => t.id === activeTabId) ?? null)
		: null;
	return matched ?? tabs[0] ?? null;
}
