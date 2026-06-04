import type { ReactNode } from "react";

interface PaneContentProps {
	children: ReactNode;
}

export function PaneContent({ children }: PaneContentProps) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
			{children}
		</div>
	);
}
