import { cn } from "@superset/ui/utils";
import { LuChevronDown, LuChevronsUpDown, LuChevronUp } from "react-icons/lu";

export type SortDirection = "asc" | "desc";

interface SortableHeaderProps<F extends string> {
	field: F;
	label: string;
	align?: "start" | "center";
	className?: string;
	sortField: F | null;
	sortDirection: SortDirection;
	onSort: (field: F) => void;
	srOnlyLabel?: boolean;
}

export function SortableHeader<F extends string>({
	field,
	label,
	align = "start",
	className,
	sortField,
	sortDirection,
	onSort,
	srOnlyLabel = false,
}: SortableHeaderProps<F>) {
	const isActive = sortField === field;
	const Icon = !isActive
		? LuChevronsUpDown
		: sortDirection === "asc"
			? LuChevronUp
			: LuChevronDown;
	const sortLabel = isActive
		? sortDirection === "asc"
			? "ascending"
			: "descending"
		: "not sorted";

	return (
		<button
			type="button"
			onClick={() => onSort(field)}
			aria-label={`Sort by ${label}, currently ${sortLabel}`}
			className={cn(
				"group flex min-w-0 items-center gap-1 rounded outline-none transition-colors",
				"hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
				align === "center" && "justify-center",
				isActive && "text-foreground",
				className,
			)}
		>
			<span className={cn("truncate", srOnlyLabel && "sr-only")}>{label}</span>
			<Icon
				className={cn(
					"size-3 shrink-0 transition-opacity",
					isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
				)}
			/>
		</button>
	);
}
