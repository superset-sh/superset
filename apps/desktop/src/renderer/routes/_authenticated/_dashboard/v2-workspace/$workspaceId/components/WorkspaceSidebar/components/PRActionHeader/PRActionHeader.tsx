import type { ReactNode } from "react";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";

interface PRActionHeaderProps {
	shipControls: ReactNode;
	/** Rendered by the page, which owns the run hooks and pane store. */
	runButton: ReactNode;
	pagesMenu: ReactNode;
}

export function PRActionHeader({
	shipControls,
	runButton,
	pagesMenu,
}: PRActionHeaderProps) {
	return (
		<div className="@container/strip flex h-12 shrink-0 items-center bg-muted/45 px-2 dark:bg-muted/35">
			<div className="@container drag flex h-full min-w-0 flex-1 items-center overflow-hidden pr-1">
				<div className="no-drag flex h-6 min-w-0 flex-wrap items-center gap-x-1 overflow-hidden">
					{shipControls}
				</div>
			</div>
			<div className="flex items-center gap-2">
				{pagesMenu}
				{runButton}
			</div>
			<WindowControlsInset />
		</div>
	);
}
