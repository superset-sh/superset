import type { ReactNode } from "react";

interface CloudWorkspaceSuggestionsRowProps {
	label: ReactNode;
	children: ReactNode;
}

export function CloudWorkspaceSuggestionsRow({
	label,
	children,
}: CloudWorkspaceSuggestionsRowProps) {
	return (
		<div className="flex min-h-8 items-start gap-3">
			<span className="w-[92px] shrink-0 pt-1.5 text-[13px] text-muted-foreground">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5">
				{children}
			</div>
		</div>
	);
}
