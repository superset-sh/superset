import type { ReactNode } from "react";

export function PaneMessage({ children }: { children: ReactNode }) {
	return (
		<div className="flex size-full min-h-0 flex-1 items-center justify-center">
			<div className="max-w-sm px-6 text-center text-sm text-muted-foreground">
				{children}
			</div>
		</div>
	);
}
