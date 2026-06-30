import type { ReactNode } from "react";

export function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex min-h-8 items-center gap-4 text-sm">
			<span className="shrink-0 text-muted-foreground">{label}</span>
			<div className="flex min-w-0 flex-1 justify-end">{value}</div>
		</div>
	);
}
