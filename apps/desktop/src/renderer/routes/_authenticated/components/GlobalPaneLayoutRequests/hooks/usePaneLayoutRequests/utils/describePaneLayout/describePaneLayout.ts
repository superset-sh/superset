import type { LayoutNode, Pane, WorkspaceState } from "@superset/panes";
import type {
	PaneLayoutNode,
	PaneLayoutPane,
	PaneLayoutSnapshot,
} from "@superset/shared/pane-layout-ops";

const TITLE_FIELDS = ["pageTitle", "title", "url", "filePath", "path", "slug"];

function readString(data: unknown, key: string): string | null {
	if (!data || typeof data !== "object") return null;
	const value = (data as Record<string, unknown>)[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function paneTitle(pane: Pane<unknown>): string | null {
	if (pane.titleOverride) return pane.titleOverride;
	for (const key of TITLE_FIELDS) {
		const value = readString(pane.data, key);
		if (value) return value;
	}
	return null;
}

function describeNode(node: LayoutNode): PaneLayoutNode {
	if (node.type === "pane") return { type: "pane", paneId: node.paneId };
	return {
		type: "split",
		direction: node.direction === "horizontal" ? "row" : "column",
		ratio: Math.min(100, Math.max(0, node.splitPercentage ?? 50)) / 100,
		first: describeNode(node.first),
		second: describeNode(node.second),
	};
}

function paneOrder(node: LayoutNode): string[] {
	if (node.type === "pane") return [node.paneId];
	return [...paneOrder(node.first), ...paneOrder(node.second)];
}

export function describePaneLayout<TData>(
	state: WorkspaceState<TData>,
): PaneLayoutSnapshot {
	return {
		activeTabId: state.activeTabId,
		tabs: state.tabs.map((tab) => ({
			id: tab.id,
			title: tab.titleOverride ?? null,
			active: tab.id === state.activeTabId,
			activePaneId: tab.activePaneId,
			layout: describeNode(tab.layout),
			panes: paneOrder(tab.layout).flatMap((id): PaneLayoutPane[] => {
				const pane = tab.panes[id];
				if (!pane) return [];
				return [
					{
						id,
						kind: pane.kind,
						title: paneTitle(pane),
						terminalId: readString(pane.data, "terminalId"),
						active: id === tab.activePaneId,
					},
				];
			}),
		})),
	};
}
