import type { ReactNode } from "react";

interface PRActionHeaderProps {
	/** Rendered by the page, which owns the run hooks and pane store. */
	runButton: ReactNode;
}

/**
 * Sidebar top strip: window-drag region plus the workspace run button. The
 * PR badge and its state machine moved to the top bar's ChangesControl, and
 * the open-in button to the pane tab bar so it survives the sidebar closing
 * (#7167), so the bar itself stays quiet.
 */
export function PRActionHeader({ runButton }: PRActionHeaderProps) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-2 bg-muted/45 px-2 dark:bg-muted/35">
			<div className="drag h-full min-w-0 flex-1" />
			<div className="flex items-center gap-2">{runButton}</div>
		</div>
	);
}
