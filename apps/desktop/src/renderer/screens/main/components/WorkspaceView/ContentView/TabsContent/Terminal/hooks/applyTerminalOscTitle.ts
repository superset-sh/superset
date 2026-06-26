export interface ApplyTerminalOscTitleOptions {
	paneId: string;
	tabId: string;
	title: string;
	setPaneName: (paneId: string, name: string) => void;
	setTabAutoTitle: (tabId: string, title: string) => void;
}

// Mirror an OSC 0/2/9;3 terminal title onto both the pane and the owning tab.
// Without the tab call the tab-bar label (which reads tab.name) stays stale
// even though pane.name is updated. setTabAutoTitle no-ops when the tab has a
// userTitle, so manual right-click renames still take precedence.
export function applyTerminalOscTitle({
	paneId,
	tabId,
	title,
	setPaneName,
	setTabAutoTitle,
}: ApplyTerminalOscTitleOptions): void {
	setPaneName(paneId, title);
	setTabAutoTitle(tabId, title);
}
