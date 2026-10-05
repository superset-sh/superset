import type { ReactNode } from "react";

interface PropertyRowProps {
	label: ReactNode;
	children: ReactNode;
}

export function PropertyRow({ label, children }: PropertyRowProps) {
	return (
		<div className="flex min-h-[30px] items-center gap-2.5 px-2">
			<span className="w-[92px] shrink-0 text-xs text-muted-foreground">
				{label}
			</span>
			<span className="flex min-w-0 flex-wrap items-center gap-1.5">
				{children}
			</span>
		</div>
	);
}
