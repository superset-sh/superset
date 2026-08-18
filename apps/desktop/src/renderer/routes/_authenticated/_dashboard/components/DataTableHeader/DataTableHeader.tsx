import { TableHeader } from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";

/**
 * Sticky table header for full-page data tables. The bottom border is drawn
 * with an inset shadow because collapsed-border table borders don't stick
 * with `position: sticky`.
 */
export const DATA_TABLE_HEAD_CELL =
	"h-8 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80";

export function DataTableHeader({
	className,
	...props
}: ComponentProps<typeof TableHeader>) {
	return (
		<TableHeader
			className={cn(
				"sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_0_var(--color-border)] [&_tr]:border-b-0",
				className,
			)}
			{...props}
		/>
	);
}
