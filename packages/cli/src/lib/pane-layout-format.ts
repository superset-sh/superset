import type {
	PaneLayoutNode,
	PaneLayoutSnapshot,
	PaneLayoutTab,
} from "@superset/shared/pane-layout-ops";

function describePane(pane: PaneLayoutTab["panes"][number]): string {
	const title = pane.terminalTitle ?? pane.title;
	const agent = pane.agent ? `${pane.agent.id} · ${pane.agent.state}` : null;
	return [
		pane.id,
		pane.kind,
		title ? `"${title}"` : null,
		agent,
		pane.terminalId ? `terminal ${pane.terminalId}` : null,
		pane.active ? "(active)" : null,
	]
		.filter(Boolean)
		.join("  ");
}

function formatNode(
	node: PaneLayoutNode,
	tab: PaneLayoutTab,
	depth: number,
): string[] {
	const indent = "  ".repeat(depth);
	if (node.type === "split") {
		const first = Math.round(node.ratio * 100);
		return [
			`${indent}${node.direction} ${first}/${100 - first}`,
			...formatNode(node.first, tab, depth + 1),
			...formatNode(node.second, tab, depth + 1),
		];
	}
	const pane = tab.panes.find((candidate) => candidate.id === node.paneId);
	return [`${indent}${pane ? describePane(pane) : node.paneId}`];
}

export function formatLayout(layout: PaneLayoutSnapshot): string {
	if (layout.tabs.length === 0) return "No panes open in this workspace.";
	return layout.tabs
		.flatMap((tab) => [
			[`tab ${tab.id}`, tab.title ?? "", tab.active ? "(active)" : ""]
				.filter(Boolean)
				.join("\t"),
			...formatNode(tab.layout, tab, 1),
		])
		.join("\n");
}
