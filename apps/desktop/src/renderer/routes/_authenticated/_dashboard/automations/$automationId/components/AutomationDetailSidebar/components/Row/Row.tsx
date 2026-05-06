import type { ReactNode } from "react";

export function Row({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex min-h-8 items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<div className="flex min-w-0 justify-end">{value}</div>
		</div>
	);
}
