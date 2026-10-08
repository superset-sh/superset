import type { ReactNode } from "react";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";

interface PRActionHeaderProps {
	/** Rendered by the page, which owns the run hooks and pane store. */
	runButton: ReactNode;
}

export function PRActionHeader({ runButton }: PRActionHeaderProps) {
	return (
		<div className="@container/strip flex h-12 shrink-0 items-center gap-2 bg-muted/45 px-2 dark:bg-muted/35">
			<div className="drag h-full min-w-0 flex-1" />
			<div className="flex items-center gap-2">{runButton}</div>
			<WindowControlsInset />
		</div>
	);
}
