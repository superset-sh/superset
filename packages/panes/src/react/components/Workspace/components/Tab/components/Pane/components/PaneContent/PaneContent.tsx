import type { ReactNode } from "react";

interface PaneContentProps {
	render: () => ReactNode;
}

export function PaneContent({ render }: PaneContentProps) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
			{render()}
		</div>
	);
}
