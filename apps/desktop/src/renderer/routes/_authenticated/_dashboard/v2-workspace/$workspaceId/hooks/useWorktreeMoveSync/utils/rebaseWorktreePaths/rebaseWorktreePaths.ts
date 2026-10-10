import type { FilePaneData } from "../../../../types";

export function rebaseWorktreePath(
	path: string,
	from: string,
	to: string,
): string {
	if (path === from) return to;
	const rest = path.slice(from.length);
	return path.startsWith(from) && (rest[0] === "/" || rest[0] === "\\")
		? to + rest
		: path;
}

interface PaneLayoutPaths {
	tabs: Array<{ panes: Record<string, { kind: string; data: unknown }> }>;
}

interface WorkspaceLocalPaths {
	paneLayout?: PaneLayoutPaths;
	rightPaneLayout?: PaneLayoutPaths;
	recentlyViewedFiles?: Array<{ absolutePath: string }>;
}

export function rebaseWorktreePaths(
	state: WorkspaceLocalPaths,
	from: string,
	to: string,
): boolean {
	let changed = false;
	const rebase = (path: string) => {
		const next = rebaseWorktreePath(path, from, to);
		if (next !== path) changed = true;
		return next;
	};
	for (const layout of [state.paneLayout, state.rightPaneLayout]) {
		for (const tab of layout?.tabs ?? []) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "file") continue;
				const data = pane.data as FilePaneData;
				data.filePath = rebase(data.filePath);
			}
		}
	}
	for (const file of state.recentlyViewedFiles ?? []) {
		file.absolutePath = rebase(file.absolutePath);
	}
	return changed;
}
