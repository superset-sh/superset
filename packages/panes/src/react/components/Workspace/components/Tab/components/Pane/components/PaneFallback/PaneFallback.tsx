import type { ReactNode } from "react";

interface PaneFallbackProps {
	title: ReactNode;
	detail: ReactNode;
	children: ReactNode;
}

export function PaneFallback({ title, detail, children }: PaneFallbackProps) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4 text-sm text-muted-foreground">
			<span className="font-medium text-foreground">{title}</span>
			<span className="line-clamp-4 max-w-md cursor-text select-text break-words text-center text-xs">
				{detail}
			</span>
			<div className="flex flex-wrap items-center justify-center gap-2">
				{children}
			</div>
		</div>
	);
}
