import { Skeleton } from "@superset/ui/skeleton";
import type { ReactNode } from "react";

interface StatTileProps {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
	loading?: boolean;
}

// A figure with a small label, no chrome of its own.
export function StatTile({ label, value, hint, loading }: StatTileProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</span>
			{loading ? (
				<Skeleton className="my-1 h-5 w-14" />
			) : (
				<span className="text-lg font-semibold leading-tight tabular-nums text-foreground">
					{value}
				</span>
			)}
			{hint !== undefined && (
				<span className="text-[10px] text-muted-foreground">{hint}</span>
			)}
		</div>
	);
}
